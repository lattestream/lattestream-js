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

export type WebhookEventType =
  | 'channel_occupied'
  | 'channel_vacated'
  | 'member_added'
  | 'member_removed'
  | 'client_event'
  | 'subscription_count';

export interface WebhookEvent {
  name: WebhookEventType;
  channel: string;
  event: string;
  data?: string;
  socketId?: string;
  userId?: string;
  subcriptionCount?: number;
}

export interface WebhookEventPayload {
  timeMs: number;
  events: WebhookEvent[];
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
