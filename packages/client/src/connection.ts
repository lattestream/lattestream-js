import { ConnectionState, ConnectionStateChangeEvent, LatteStreamOptions } from './types';
import { MessageQueue, PerformanceMonitor, debounce } from './performance';
import { parseBinaryMessage, isBinaryMessage } from './binary-protocol';

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
  }

  connect(): void {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.setState('connecting');
    this.clearTimers();

    const protocol = this.options.forceTLS ? 'wss' : 'ws';
    const endpoint = this.options.wsEndpoint || this.getDefaultEndpoint();
    const url = this.isToken() ? `${protocol}://${endpoint}` : `${protocol}://${endpoint}/app/${this.appKeyOrToken}`;

    try {
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
    // Called when a channel subscription succeeds
    // This confirms we have a truly working connection
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

  private getAppKey(): string {
    return this.isToken() ? 'token-based' : this.appKeyOrToken;
  }

  supportsPrivateChannels(): boolean {
    // Only lspc_ tokens and legacy app keys support private channels
    // lspk_ public keys are for public channels only
    return !this.isPublicKey();
  }

  private bindEvents(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.log('WebSocket connected successfully');
      // Don't reset reconnection state immediately - wait until truly authenticated

      if (this.isToken()) {
        // For token-based authentication, send auth message
        this.sendRaw({ api_key: this.appKeyOrToken });
        if (this.isPrivateToken()) {
          this.log('Sent lspc_ token authentication');
        } else if (this.isPublicKey()) {
          this.log('Sent lspk_ public key authentication');
        }
      } else {
        // For legacy app key authentication, connection is ready
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

      // Handle binary messages using utility functions
      if (isBinaryMessage(event.data)) {
        this.log('Received binary message, attempting to parse');
        message = await parseBinaryMessage(event.data);
      } else if (typeof event.data === 'string') {
        // Handle text messages (JSON)
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

        // For token-based auth, set connected state after receiving connection_established
        if (this.isToken() && this.state !== 'connected') {
          this.log('Setting state to connected');
          this.setState('connected');
        } else {
          this.log('NOT setting state to connected - isToken:', this.isToken(), 'current state:', this.state);
        }
        // Don't forward connection_established to client
        return null;
      } else if (message.event === 'lattestream:pong') {
        this.handlePong();
        // Don't forward pong to client
        return null;
      } else {
        // Forward all other events (including lattestream_internal: events) to the client
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

  private async checkNetworkConnectivity(): Promise<boolean> {
    // Check if navigator.onLine is available (browser environment)
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      if (!navigator.onLine) {
        this.log('Network appears to be offline according to navigator.onLine');
        return false;
      }
    }

    // Simple connectivity check using a small HTTP request
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.log('Network connectivity check passed');
      return true;
    } catch (error) {
      this.log('Network connectivity check failed:', error);
      return false;
    }
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

    // Check network connectivity before attempting reconnection
    const isConnected = await this.checkNetworkConnectivity();
    if (!isConnected) {
      this.log('Network connectivity check failed, retrying in 10 seconds');
      this.reconnectTimer = window.setTimeout(() => {
        this.attemptReconnect();
      }, 10000);
      return;
    }

    // Calculate exponential backoff delay
    const exponentialDelay = Math.pow(backoffMultiplier, this.reconnectAttempts) * baseDelay;
    let delay = Math.min(exponentialDelay, maxGap * 1000);

    // Add jitter to prevent thundering herd problem
    if (enableJitter) {
      // Add random jitter between 0% and 25% of the delay
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
