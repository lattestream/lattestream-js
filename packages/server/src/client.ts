import { EncryptionHelper } from './encryption';
import { ConnectionPool, BatchProcessor, RequestCache, createRetryWrapper } from './performance';
import {
  LatteStreamServerOptions,
  TriggerEventOptions,
  BatchTriggerEvent,
  ChannelInfo,
  ServerEvent,
  ClientTokenRequest,
  ClientTokenResponse,
} from './types';

export class LatteStreamServer {
  private encryptionHelper: EncryptionHelper;
  private apiEndpoint: string;
  private connectionPool: ConnectionPool;
  private batchProcessor: BatchProcessor<ServerEvent> | null = null;
  private requestCache: RequestCache<any>;
  private makeRequestWithRetry: typeof this.makeApiRequest;

  constructor(private encryptedSecret: string, private options: LatteStreamServerOptions = {}) {
    if (!encryptedSecret.startsWith('lsk_')) {
      throw new Error('Invalid encrypted secret: must start with lsk_');
    }

    this.encryptionHelper = new EncryptionHelper(encryptedSecret);
    this.apiEndpoint = this.buildApiEndpoint();
    this.connectionPool = new ConnectionPool(
      this.options.maxConnections || 20,
      this.options.connectionMaxAge || 300000
    );
    this.requestCache = new RequestCache(this.options.cacheTimeout || 30000);
    this.makeRequestWithRetry = createRetryWrapper(
      this.makeApiRequest.bind(this),
      this.options.maxRetries || 3,
      this.options.retryDelay || 1000
    );

    if (this.options.enableBatching !== false) {
      this.batchProcessor = new BatchProcessor<ServerEvent>(
        (events) => this.processBatchEvents(events),
        this.options.batchSize || 50,
        this.options.batchInterval || 100
      );
    }
  }

  async trigger(
    channel: string | string[],
    event: string,
    data: any,
    options: TriggerEventOptions = {}
  ): Promise<void> {
    const channels = Array.isArray(channel) ? channel : [channel];

    if (channels.length === 0) {
      throw new Error('At least one channel must be specified');
    }

    if (channels.length > 100) {
      throw new Error('Cannot trigger events on more than 100 channels at once');
    }

    this.validateEventName(event);
    this.validateChannels(channels);

    const payload: ServerEvent = {
      channel: channels.length === 1 ? channels[0] : channels.join(','),
      event,
      data: JSON.stringify(data),
      socketId: options.socketId,
    };

    if (this.batchProcessor && this.options.enableBatching !== false) {
      this.batchProcessor.add(payload);
    } else {
      await this.makeRequestWithRetry('POST', '/events', payload);
    }
  }

  async triggerBatch(events: BatchTriggerEvent[]): Promise<void> {
    if (events.length === 0) {
      throw new Error('At least one event must be specified');
    }

    if (events.length > 10) {
      throw new Error('Cannot trigger more than 10 events in a batch');
    }

    events.forEach((event, index) => {
      this.validateEventName(event.name);
      this.validateChannels([event.channel]);

      if (!event.data) {
        throw new Error(`Event at index ${index} is missing data`);
      }
    });

    const payload = {
      batch: events.map((event) => ({
        channel: event.channel,
        name: event.name,
        data: JSON.stringify(event.data),
        socket_id: event.socketId,
      })),
    };

    await this.makeRequestWithRetry('POST', '/batch_events', payload);
  }

  async getChannelInfo(channel: string, info?: string[]): Promise<ChannelInfo> {
    this.validateChannels([channel]);

    const params = new URLSearchParams();
    if (info && info.length > 0) {
      params.append('info', info.join(','));
    }

    const url = `/channels/${encodeURIComponent(channel)}${params.toString() ? '?' + params.toString() : ''}`;
    const cacheKey = `channel_info:${channel}:${info?.join(',') || ''}`;

    return this.requestCache.get(cacheKey, () => this.makeRequestWithRetry('GET', url) as Promise<ChannelInfo>);
  }

  async getChannels(filterByPrefix?: string, info?: string[]): Promise<{ channels: Record<string, ChannelInfo> }> {
    const params = new URLSearchParams();

    if (filterByPrefix) {
      params.append('filter_by_prefix', filterByPrefix);
    }

    if (info && info.length > 0) {
      params.append('info', info.join(','));
    }

    const url = `/channels${params.toString() ? '?' + params.toString() : ''}`;
    const cacheKey = `channels:${filterByPrefix || ''}:${info?.join(',') || ''}`;

    return this.requestCache.get(
      cacheKey,
      () => this.makeRequestWithRetry('GET', url) as Promise<{ channels: Record<string, ChannelInfo> }>
    );
  }

  async getUsers(channel: string): Promise<{ users: Array<{ id: string }> }> {
    if (!channel.startsWith('presence-')) {
      throw new Error('User list is only available for presence channels');
    }

    this.validateChannels([channel]);

    const url = `/channels/${encodeURIComponent(channel)}/users`;
    const cacheKey = `users:${channel}`;

    return this.requestCache.get(
      cacheKey,
      () => this.makeRequestWithRetry('GET', url) as Promise<{ users: Array<{ id: string }> }>
    );
  }

  async terminateUserConnections(userId: string): Promise<void> {
    if (!userId) {
      throw new Error('User ID is required');
    }

    await this.makeRequestWithRetry('POST', `/users/${encodeURIComponent(userId)}/terminate_connections`);

    this.requestCache.clear();
  }

  generateWebhookSignature(payload: string): string {
    return this.encryptionHelper.generateWebhookSignature(payload);
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    return this.encryptionHelper.verifyWebhookSignature(payload, signature);
  }

  async authorizeChannel(
    socketId: string,
    channelName: string,
    userData?: any
  ): Promise<{ auth: string; channel_data?: string }> {
    if (!channelName || typeof channelName !== 'string') {
      throw new Error('Channel name is required and must be a string');
    }

    if (!socketId || typeof socketId !== 'string') {
      throw new Error('Socket ID is required and must be a string');
    }

    this.validateChannels([channelName]);

    if (channelName.startsWith('private-') || channelName.startsWith('presence-')) {
      const payload: any = {
        socket_id: socketId,
        channel_name: channelName,
      };

      if (channelName.startsWith('presence-') && userData) {
        payload.channel_data = userData;
      }

      const response = await this.makeRequestWithRetry('POST', '/auth', payload);

      const result: { auth: string; channel_data?: string } = {
        auth: response.auth,
      };

      if (response.channel_data) {
        result.channel_data = response.channel_data;
      }

      return result;
    }

    throw new Error('Public channels do not require authorization');
  }

  async flushBatch(): Promise<void> {
    if (this.batchProcessor) {
      await this.batchProcessor.flush();
    }
  }

  destroy(): void {
    this.connectionPool.destroy();
    this.requestCache.clear();
    if (this.batchProcessor) {
      this.batchProcessor.clear();
    }
  }

  private async processBatchEvents(events: ServerEvent[]): Promise<void> {
    const payload = {
      batch: events.map((event) => ({
        channel: event.channel,
        name: event.event,
        data: event.data,
        socket_id: event.socketId,
      })),
    };

    await this.makeRequestWithRetry('POST', '/batch_events', payload);
  }

  private async makeApiRequest(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.apiEndpoint}${path}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = this.encryptionHelper.generateSocketId();

    const requestBody = body ? JSON.stringify(body) : '';
    const stringToSign = `${method}\n${path}\n${requestBody}`;
    const signature = this.encryptionHelper.generateWebhookSignature(stringToSign + timestamp + nonce);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: this.encryptedSecret,
      'X-LatteStream-Signature': signature,
      'X-LatteStream-Timestamp': timestamp,
      'X-LatteStream-Nonce': nonce,
    };

    const timeout = this.options.timeout || 30000;
    const requestKey = `${method}:${path}`;
    const controller = this.connectionPool.acquire(requestKey);
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: requestBody || undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.connectionPool.release(requestKey);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const responseText = await response.text();
      return responseText ? JSON.parse(responseText) : {};
    } catch (error) {
      clearTimeout(timeoutId);
      this.connectionPool.release(requestKey);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
      }

      throw new Error('Unknown error occurred during API request');
    }
  }

  private async makeTokenRequest(tokenRequest: ClientTokenRequest): Promise<any> {
    const tokenEndpoint = this.buildApiEndpoint();
    const timeout = this.options.timeout || 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${tokenEndpoint}/apps/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: tokenRequest.apiKey,
          socket_id: tokenRequest.socketId,
          permissions: tokenRequest.permissions,
          expires_in: tokenRequest.expiresIn,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token generation failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Token request timeout after ${timeout}ms`);
        }
        throw error;
      }

      throw new Error('Unknown error occurred during token request');
    }
  }

  private buildApiEndpoint(): string {
    const protocol = this.options.useTLS !== false ? 'https' : 'http';
    const cluster = this.options.cluster || 'eu1';
    const endpoint = this.options.wsEndpoint || `${cluster}.lattestream.com`;

    return `${protocol}://${endpoint}`;
  }

  private validateEventName(event: string): void {
    if (!event || typeof event !== 'string') {
      throw new Error('Event name must be a non-empty string');
    }

    if (event.length > 200) {
      throw new Error('Event name cannot be longer than 200 characters');
    }

    if (event.startsWith('lattestream:')) {
      throw new Error('Event names cannot start with "lattestream:"');
    }
  }

  private validateChannels(channels: string[]): void {
    channels.forEach((channel) => {
      if (!channel || typeof channel !== 'string') {
        throw new Error('Channel name must be a non-empty string');
      }

      if (channel.length > 200) {
        throw new Error('Channel name cannot be longer than 200 characters');
      }

      const validChannelPattern = /^[a-zA-Z0-9_\-=@,.;]+$/;
      if (!validChannelPattern.test(channel)) {
        throw new Error(`Invalid channel name: ${channel}`);
      }
    });
  }
}
