import { Connection } from './connection';
import { Channel, PublicChannel, PrivateChannel, PresenceChannel } from './channel';
import { Authorizer, getChannelType } from './auth';
import { FastEventEmitter } from './performance';
import { parseBinaryMessage, isBinaryMessage } from './binary-protocol';
import { LatteStreamOptions, ConnectionState, ConnectionStateChangeEvent, EventCallback, AuthOptions } from './types';

export class LatteStream {
  private connection: Connection;
  private authorizer: Authorizer | null = null;
  private channels = new Map<string, Channel>();
  private globalEventEmitter = new FastEventEmitter();
  private throttledStateChange: (event: ConnectionStateChangeEvent) => void;

  constructor(
    private appKeyOrToken: string,
    private options: LatteStreamOptions = {},
  ) {
    // Temporarily remove throttle to debug
    this.throttledStateChange = (event: ConnectionStateChangeEvent) => {
      this.log(`[LatteStream Client] directStateChange called: ${event.previous} -> ${event.current}`);
      this.handleConnectionStateChange(event);
    };

    if (this.options.authEndpoint) {
      this.authorizer = new Authorizer(this.options.authEndpoint, {}, this.options);
    }

    this.connection = new Connection(
      this.appKeyOrToken,
      this.options,
      this.throttledStateChange,
      (message: any, originalEvent: MessageEvent) => {
        // Connection already parsed the message, just handle it
        this.handleParsedMessage(message);
      },
      this.handleError.bind(this),
    );
  }

  connect(): void {
    this.connection.connect();
  }

  disconnect(): void {
    this.channels.forEach((channel) => channel.unsubscribe());
    this.channels.clear();
    this.connection.disconnect();
  }

  subscribe(channelName: string, authOptions?: AuthOptions): Channel {
    this.log(`[LatteStream] Subscribing to channel: ${channelName}`);

    if (this.channels.has(channelName)) {
      this.log(`[LatteStream] Channel ${channelName} already exists`);
      return this.channels.get(channelName)!;
    }

    const channelType = getChannelType(channelName);
    this.log(`[LatteStream] Channel type: ${channelType}`);
    let channel: Channel;

    switch (channelType) {
      case 'private':
        this.log(`[LatteStream] Creating private channel, authorizer available: ${!!this.authorizer}`);
        if (!this.authorizer) {
          throw new Error('Private channels require authEndpoint to be configured');
        }
        channel = new PrivateChannel(
          channelName,
          this.send.bind(this),
          (name, socketId) => {
            this.log(`[LatteStream] Private channel authorize called for ${name} with socketId ${socketId}`);
            return this.authorizer!.authorize(name, socketId, authOptions);
          },
          this.options,
        );
        break;

      case 'presence':
        this.log(`[LatteStream] Creating presence channel, authorizer available: ${!!this.authorizer}`);
        if (!this.authorizer) {
          throw new Error('Presence channels require authEndpoint to be configured');
        }
        channel = new PresenceChannel(
          channelName,
          this.send.bind(this),
          (name, socketId) => {
            this.log(`[LatteStream] Presence channel authorize called for ${name} with socketId ${socketId}`);
            return this.authorizer!.authorize(name, socketId, authOptions);
          },
          this.options,
        );
        break;

      default:
        this.log(`[LatteStream] Creating public channel`);
        channel = new PublicChannel(channelName, this.send.bind(this), this.options);
    }

    this.channels.set(channelName, channel);

    // Always attempt to subscribe immediately - subscribeChannel will handle the connection state check
    this.log(`[LatteStream] Attempting to subscribe to ${channelName}`);
    this.subscribeChannel(channel).catch((error) => {
      this.log(`[LatteStream] Failed to subscribe to ${channelName}:`, error);
    });

    return channel;
  }

  unsubscribe(channelName: string): void {
    const channel = this.channels.get(channelName);
    if (channel) {
      channel.unsubscribe();
      this.channels.delete(channelName);
    }
  }

  bind(eventName: string, callback: EventCallback): void {
    this.globalEventEmitter.on(eventName, callback);
  }

  unbind(eventName?: string, callback?: EventCallback): void {
    if (!eventName) {
      this.globalEventEmitter.clear();
      return;
    }
    this.globalEventEmitter.off(eventName, callback);
  }

  getSocketId(): string | null {
    return this.connection.getSocketId();
  }

  getConnectionState(): ConnectionState {
    return this.connection.getState();
  }

  getReconnectionAttempts(): number {
    return this.connection.getReconnectionAttempts();
  }

  forceReconnect(): void {
    this.log('[LatteStream Client] Force reconnection requested');
    this.connection.forceReconnect();
  }

  private send(data: any): boolean {
    this.log(`[LatteStream Client] send() called with:`, data);
    const result = this.connection.send(data);
    this.log(`[LatteStream Client] send() result:`, result);
    return result;
  }

  private handleConnectionStateChange(event: ConnectionStateChangeEvent): void {
    this.log(`[LatteStream Client] handleConnectionStateChange called: ${event.previous} -> ${event.current}`);

    if (event.current === 'connected') {
      this.log(`[LatteStream Client] Connection established, subscribing to all channels`);
      this.subscribeAllChannels();
    } else if (event.current === 'disconnected' || event.current === 'failed') {
      this.log(`[LatteStream Client] Connection lost, resetting all channel subscription states`);
      this.resetChannelStates();
    }

    this.triggerGlobalEvent('connection_state_change', event);
  }

  private handleParsedMessage(message: any): void {
    this.log(`[LatteStream Client] handleParsedMessage received:`, message);

    // Check for channel at top level (standard format) or nested in data (lattestream_internal format)
    const channel = message.channel || (message.data && message.data.channel);

    if (channel) {
      this.log(`[LatteStream Client] Routing to handleChannelEvent for channel: ${channel}`);
      // For lattestream_internal events, create a normalized message format
      const normalizedMessage = {
        ...message,
        channel: channel,
      };
      this.handleChannelEvent(normalizedMessage);
    } else {
      this.log(`[LatteStream Client] Routing to handleGlobalEvent (no channel property)`);
      this.handleGlobalEvent(message);
    }
  }

  // Keep the old method for backward compatibility (not used by Connection anymore)
  private async handleMessage(event: MessageEvent): Promise<void> {
    try {
      let message: any;

      // Handle binary messages using utility functions
      if (isBinaryMessage(event.data)) {
        this.log(`[LatteStream Client] Received binary message, attempting to parse`);
        message = await parseBinaryMessage(event.data);
      } else if (typeof event.data === 'string') {
        this.log(`[LatteStream Client] Received text message, parsing as JSON`);
        message = JSON.parse(event.data);
      } else {
        this.log(`[LatteStream Client] Unknown message type:`, typeof event.data);
        return;
      }

      this.handleParsedMessage(message);
    } catch (error) {
      this.log('Error parsing message:', error);
    }
  }

  private handleChannelEvent(message: any): void {
    this.log(`[LatteStream Client] handleChannelEvent called for channel: ${message.channel}, event: ${message.event}`);
    const channel = this.channels.get(message.channel);
    if (!channel) {
      this.log(`[LatteStream Client] No channel found for: ${message.channel}`);
      return;
    }

    if (
      message.event === 'lattestream:subscription_succeeded' ||
      message.event === 'lattestream_internal:subscription_succeeded'
    ) {
      this.log(`[LatteStream Client] Calling handleSubscriptionSucceeded for channel: ${message.channel}`);
      channel.handleSubscriptionSucceeded(message.data);
      // Reset exponential backoff on successful subscription - confirms we have a working connection
      this.connection.resetBackoffOnSuccess();
    } else if (
      message.event === 'lattestream:subscription_error' ||
      message.event === 'lattestream_internal:subscription_error'
    ) {
      channel.handleSubscriptionError(message.data);
    } else if (
      (message.event === 'lattestream:member_added' || message.event === 'lattestream_internal:member_added') &&
      channel instanceof PresenceChannel
    ) {
      channel.handleMemberAdded(message.data);
    } else if (
      (message.event === 'lattestream:member_removed' || message.event === 'lattestream_internal:member_removed') &&
      channel instanceof PresenceChannel
    ) {
      channel.handleMemberRemoved(message.data);
    } else {
      channel.handleEvent(message.event, message.data);
    }
  }

  private parseEventData(data: any): any {
    // If data is a string that looks like JSON, parse it
    if (typeof data === 'string') {
      const trimmed = data.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          const parsed = JSON.parse(data);
          this.log(`[LatteStream Client] Parsed JSON data for global event:`, parsed);
          return parsed;
        } catch (error) {
          this.log(`[LatteStream Client] Failed to parse JSON data for global event:`, error);
          // Return original string if parsing fails
          return data;
        }
      }
    }

    // Return data as-is if it's not a JSON string
    return data;
  }

  private handleGlobalEvent(message: any): void {
    const parsedData = this.parseEventData(message.data);
    this.triggerGlobalEvent(message.event, parsedData);
  }

  private triggerGlobalEvent(eventName: string, data?: any): void {
    this.globalEventEmitter.emit(eventName, data);
  }

  private handleError(error: Event): void {
    this.triggerGlobalEvent('error', error);
  }

  private resetChannelStates(): void {
    this.log(`[LatteStream] Resetting subscription state for ${this.channels.size} channels`);
    this.channels.forEach((channel) => {
      if (channel.isSubscribed()) {
        this.log(`[LatteStream] Resetting subscription state for channel: ${channel.name}`);
        // @ts-ignore - accessing protected field to reset state
        (channel as any).subscribed = false;
      }
    });
  }

  private subscribeAllChannels(): void {
    this.log(`[LatteStream] subscribeAllChannels called - Channel count: ${this.channels.size}`);
    if (this.channels.size === 0) {
      this.log(`[LatteStream] No channels to subscribe to`);
      return;
    }

    this.channels.forEach((channel) => {
      this.log(`[LatteStream] Subscribing to channel: ${channel.name}, type: ${channel.getType()}`);
      this.subscribeChannel(channel);
    });
  }

  private async subscribeChannel(channel: Channel): Promise<void> {
    const connectionState = this.connection.getState();
    const socketId = this.connection.getSocketId();

    this.log(`[LatteStream] Subscribing channel ${channel.name}, state: ${connectionState}, socketId: ${socketId}`);

    // If not connected, the subscription will be handled when connection is established
    if (connectionState !== 'connected' || !socketId) {
      this.log(`[LatteStream] Connection not ready (${connectionState}), subscription will be deferred`);
      return;
    }

    if (channel instanceof PrivateChannel || channel instanceof PresenceChannel) {
      this.log(`[LatteStream] Subscribing private/presence channel ${channel.name}`);
      await channel.subscribe(socketId);
    } else {
      this.log(`[LatteStream] Subscribing public channel ${channel.name}`);
      channel.subscribe();
    }
  }

  private log(...args: any[]): void {
    if (this.options.enableLogging) {
      console.log('[LatteStream]', ...args);
    }
  }
}
