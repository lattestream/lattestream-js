import { ConnectionState, ConnectionStateChangeEvent, LatteStreamOptions, DiscoveryResponse } from './types';
import { MessageQueue, PerformanceMonitor, debounce } from './performance';
import { parseBinaryMessage, isBinaryMessage } from './binary-protocol';
import { DiscoveryService } from './discovery';

export class Connection {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private activityTimer: number | null = null;
  private pongTimer: number | null = null;
  private socketId: string | null = null;
  private messageQueue: MessageQueue;
  private performanceMonitor: PerformanceMonitor;
  private debouncedReconnect: () => void;
  private discoveryService: DiscoveryService;
  private discoveryToken: string | null = null;
  private discoveryData: DiscoveryResponse | null = null;

  constructor(
    private appKeyOrToken: string,
    private options: LatteStreamOptions,
    private onStateChange: (event: ConnectionStateChangeEvent) => void,
    private onMessage: (message: any, originalEvent: MessageEvent) => void,
    private onError: (error: Event) => void
  ) {
    this.performanceMonitor = new PerformanceMonitor();
    this.messageQueue = new MessageQueue(
      (messages) => this.sendRaw(messages),
      this.options.batchSize || 10,
      this.options.batchInterval || 16
    );
    this.debouncedReconnect = debounce(() => this.attemptReconnect(), 100);
    this.discoveryService = new DiscoveryService({
      maxAttempts: 3,
      baseDelay: 1000,
      backoffMultiplier: 2,
      enableJitter: true,
      enableLogging: this.options.enableLogging,
    });
  }

  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.setState('connecting');
    this.clearTimers();

    try {
      if (this.isPublicKey()) {
        await this.performDiscovery();

        if (!this.discoveryToken) {
          throw new Error('Discovery token required for public key authentication');
        }
      }

      if (!this.isToken()) {
        throw new Error('Invalid API key format. Please use a valid LatteStream token (lspc_ or lspk_)');
      }

      const protocol = this.options.forceTLS ? 'wss' : 'ws';
      const endpoint = this.getEndpoint();
      let url = `${protocol}://${endpoint}`;

      if (this.discoveryToken) {
        url += `?discovery_token=${this.discoveryToken}`;
      }

      this.ws = new WebSocket(url);
      this.bindEvents();
      this.startActivityTimer();
    } catch (error) {
      this.handleConnectionError(error);
    }
  }

  disconnect(): void {
    this.clearTimers();
    this.reconnectAttempts = 0;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState('disconnected');
  }

  send(data: any): boolean {
    this.log(`[LatteStream Connection] send() called, state: ${this.state}, data:`, data);

    if (this.state !== 'connected') {
      this.log(`[LatteStream Connection] send() failed - not connected (state: ${this.state})`);
      return false;
    }

    if (this.options.enableBatching !== false) {
      this.log(`[LatteStream Connection] send() enqueueing for batch`);
      this.messageQueue.enqueue(data);
      return true;
    }

    this.log(`[LatteStream Connection] send() calling sendRaw directly`);
    return this.sendRaw(data);
  }

  private sendRaw(data: any): boolean {
    this.log(`[LatteStream Connection] sendRaw() called, ws state: ${this.ws?.readyState}, data:`, data);

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log(`[LatteStream Connection] sendRaw() failed - WebSocket not ready (readyState: ${this.ws?.readyState})`);
      return false;
    }

    const endTiming = this.performanceMonitor.startTiming('message_send');

    try {
      const serialized = JSON.stringify(data);
      this.log(`[LatteStream Connection] sendRaw() sending WebSocket message:`, serialized);
      this.ws.send(serialized);
      endTiming();
      this.log(`[LatteStream Connection] sendRaw() SUCCESS - message sent`);
      return true;
    } catch (error) {
      endTiming();
      this.log(`[LatteStream Connection] sendRaw() ERROR:`, error);
      this.log('Error sending data:', error);
      return false;
    }
  }

  getSocketId(): string | null {
    return this.socketId;
  }

  getState(): ConnectionState {
    return this.state;
  }

  getReconnectionAttempts(): number {
    return this.reconnectAttempts;
  }

  forceReconnect(): void {
    this.log('Force reconnection requested');
    this.clearTimers();
    this.reconnectAttempts = 0; // Reset attempts for manual reconnection

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState('connecting');
    this.connect();
  }

  resetBackoffOnSuccess(): void {
    this.resetReconnectionState();
  }

  private isToken(): boolean {
    return this.appKeyOrToken.startsWith('lspc_') || this.appKeyOrToken.startsWith('lspk_');
  }

  private isPrivateToken(): boolean {
    return this.appKeyOrToken.startsWith('lspc_');
  }

  private isPublicKey(): boolean {
    return this.appKeyOrToken.startsWith('lspk_');
  }

  supportsPrivateChannels(): boolean {
    return !this.isPublicKey();
  }

  private bindEvents(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.log('WebSocket connected successfully');

      if (this.isToken()) {
        this.sendRaw({ api_key: this.appKeyOrToken });
        if (this.isPrivateToken()) {
          this.log('Sent lspc_ token authentication');
        } else if (this.isPublicKey()) {
          this.log('Sent lspk_ public key authentication');
        }
      } else {
        this.setState('connected');
      }
    };

    this.ws.onmessage = async (event) => {
      try {
        const parsedMessage = await this.handleMessage(event);
        if (parsedMessage) {
          this.onMessage(parsedMessage, event);
        }
        this.resetActivityTimer();
      } catch (error) {
        this.log('Error in onmessage handler:', error);
        this.onError(error as Event);
      }
    };

    this.ws.onclose = (event) => {
      this.log('WebSocket closed - Code:', event.code, 'Reason:', event.reason, 'WasClean:', event.wasClean);
      this.handleDisconnection();
    };

    this.ws.onerror = (error) => {
      this.log('WebSocket error - ReadyState:', this.ws?.readyState, 'URL:', this.ws?.url);
      this.log('WebSocket error:', error);
      this.onError(error);
    };
  }

  private async handleMessage(event: MessageEvent): Promise<any | null> {
    this.log('Connection handleMessage called with:', event.data);
    const endTiming = this.performanceMonitor.startTiming('message_parse');

    try {
      let message: any;

      if (isBinaryMessage(event.data)) {
        this.log('Received binary message, attempting to parse');
        message = await parseBinaryMessage(event.data);
      } else if (typeof event.data === 'string') {
        this.log('Received text message, parsing as JSON');
        message = JSON.parse(event.data);
      } else {
        this.log('Unknown message type:', typeof event.data);
        endTiming();
        return null;
      }

      this.log('Parsed message:', message);
      endTiming();

      if (message.event === 'lattestream:connection_established') {
        this.socketId = message.data.socket_id;
        this.log('Connection established with socket ID:', this.socketId);
        this.log('Current state:', this.state, 'Is token:', this.isToken());

        if (this.isToken() && this.state !== 'connected') {
          this.log('Setting state to connected');
          this.setState('connected');
        } else {
          this.log('NOT setting state to connected - isToken:', this.isToken(), 'current state:', this.state);
        }
        return null;
      } else if (message.event === 'lattestream:pong') {
        this.handlePong();
        // Don't forward pong to client
        return null;
      } else {
        this.log('Forwarding message event to client:', message.event);
        return message;
      }
    } catch (error) {
      endTiming();
      this.log('Error parsing message:', error);
      return null;
    }
  }

  private resetReconnectionState(): void {
    if (this.reconnectAttempts === 0) {
      return; // Already reset, avoid unnecessary logging
    }
    this.reconnectAttempts = 0;
    this.log('Reconnection state reset - connection established successfully');
  }

  private handleDisconnection(): void {
    this.ws = null;
    this.clearTimers();
    this.messageQueue.clear();

    // Only attempt reconnection if we were previously connected
    // and haven't exceeded max attempts
    if (this.state === 'connected' || this.state === 'connecting') {
      this.log('Connection lost, initiating reconnection sequence');
      this.setState('disconnected');
      this.debouncedReconnect();
    } else if (this.state === 'unavailable') {
      // We were already trying to reconnect, continue the process
      this.log('Connection still unavailable, continuing reconnection attempts');
      this.debouncedReconnect();
    }
  }

  private handleConnectionError(error: any): void {
    this.log('Connection error:', error);
    this.setState('failed');
    this.debouncedReconnect();
  }

  private async attemptReconnect(): Promise<void> {
    const maxAttempts = this.options.maxReconnectionAttempts || 6;
    const maxGap = this.options.maxReconnectGapInSeconds || 30;
    const baseDelay = this.options.reconnectBaseDelay || 1000;
    const backoffMultiplier = this.options.reconnectBackoffMultiplier || 2;
    const enableJitter = this.options.reconnectJitter !== false; // Default true

    if (this.reconnectAttempts >= maxAttempts) {
      this.log(`Max reconnection attempts (${maxAttempts}) reached. Setting state to failed.`);
      this.setState('failed');
      return;
    }

    const exponentialDelay = Math.pow(backoffMultiplier, this.reconnectAttempts) * baseDelay;
    let delay = Math.min(exponentialDelay, maxGap * 1000);

    if (enableJitter) {
      const jitterRange = delay * 0.25;
      const jitter = Math.random() * jitterRange;
      delay = delay + jitter;
    }

    this.reconnectAttempts++;

    this.log(`Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}/${maxAttempts})`);
    this.log(
      `Reconnection strategy: baseDelay=${baseDelay}ms, multiplier=${backoffMultiplier}, jitter=${enableJitter}`
    );

    // Set state to indicate we're about to reconnect
    if (this.state !== 'connecting') {
      this.setState('unavailable');
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.log(`Attempting reconnection ${this.reconnectAttempts}/${maxAttempts}`);
      this.connect();
    }, delay);
  }

  private startActivityTimer(): void {
    const timeout = this.options.activityTimeout || 120000; // 2 minutes

    this.activityTimer = window.setTimeout(() => {
      this.sendPing();
    }, timeout);
  }

  private resetActivityTimer(): void {
    if (this.activityTimer) {
      clearTimeout(this.activityTimer);
    }
    this.startActivityTimer();
  }

  private sendPing(): void {
    if (this.state === 'connected') {
      this.send({ event: 'lattestream:ping', data: {} });
      this.startPongTimer();
    }
  }

  private startPongTimer(): void {
    const timeout = this.options.pongTimeout || 30000; // 30 seconds

    this.pongTimer = window.setTimeout(() => {
      this.log('Pong timeout - closing connection');
      this.disconnect();
    }, timeout);
  }

  private handlePong(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.activityTimer) {
      clearTimeout(this.activityTimer);
      this.activityTimer = null;
    }

    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private setState(newState: ConnectionState): void {
    const previous = this.state;
    this.state = newState;
    this.log(`State change: ${previous} -> ${newState}`);

    if (previous !== newState) {
      this.log('Triggering state change callback');
      this.onStateChange({ previous, current: newState });
    }
  }

  private async performDiscovery(): Promise<void> {
    const discoveryEndpoint = this.options.wsEndpoint || this.getDefaultEndpoint();

    this.log(`Performing discovery on endpoint: ${discoveryEndpoint}`);

    try {
      this.discoveryData = await this.discoveryService.discover(this.appKeyOrToken, discoveryEndpoint);

      this.discoveryToken = this.discoveryData.discovery_token;

      this.log('Discovery completed successfully', {
        node_id: this.discoveryData.node_id,
        cluster: this.discoveryData.cluster,
        region: this.discoveryData.region,
      });
    } catch (error) {
      this.log('Discovery failed:', error);
      throw error;
    }
  }

  private getEndpoint(): string {
    if (this.options.wsEndpoint?.includes('localhost')) {
      return this.options.wsEndpoint;
    }

    if (this.discoveryData) {
      return `${this.discoveryData.cluster}-node${this.discoveryData.node_id}.lattestream.com`;
    }

    return this.options.wsEndpoint || this.getDefaultEndpoint();
  }

  private getDefaultEndpoint(): string {
    const cluster = this.options.cluster || 'eu1';
    return `${cluster}.lattestream.com`;
  }

  private log(...args: any[]): void {
    if (this.options.enableLogging) {
      console.log('[LatteStream]', ...args);
    }
  }
}
