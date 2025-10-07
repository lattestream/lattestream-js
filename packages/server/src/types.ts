export interface LatteStreamServerOptions {
  wsEndpoint?: string;
  cluster?: string;
  useTLS?: boolean;
  enableLogging?: boolean;
  timeout?: number;
  maxConnections?: number;
  connectionMaxAge?: number;
  cacheTimeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  enableBatching?: boolean;
  batchSize?: number;
  batchInterval?: number;
}

export interface TriggerEventOptions {
  socketId?: string;
  info?: Record<string, any>;
}

export interface BatchTriggerEvent {
  channel: string;
  name: string;
  data: any;
  socketId?: string;
}

export interface AuthenticationResult {
  auth: string;
  channelData?: string;
}

export interface ChannelInfo {
  occupied: boolean;
  userCount?: number;
  subscriptionCount: number;
}

export interface WebhookEvent {
  timeMs: number;
  events: Array<{
    name: string;
    channel: string;
    event: string;
    data?: string;
    socketId?: string;
    userId?: string;
  }>;
}

export interface ServerEvent {
  channel: string;
  event: string;
  data: any;
  socketId?: string;
}

export interface ClientTokenRequest {
  apiKey: string;
  socketId: string;
  permissions?: string[];
  expiresIn?: number;
}

export interface ClientTokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  tenantId: string;
}
