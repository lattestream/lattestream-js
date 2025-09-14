export interface LatteStreamOptions {
  wsEndpoint?: string;
  authEndpoint?: string;
  cluster?: string;
  forceTLS?: boolean;
  enableLogging?: boolean;
  activityTimeout?: number;
  pongTimeout?: number;
  unavailableTimeout?: number;
  maxReconnectionAttempts?: number;
  maxReconnectGapInSeconds?: number;
  reconnectBaseDelay?: number; // Base delay in ms (default: 1000)
  reconnectBackoffMultiplier?: number; // Multiplier for exponential backoff (default: 2)
  reconnectJitter?: boolean; // Add random jitter to prevent thundering herd (default: true)
  enableBatching?: boolean;
  batchSize?: number;
  batchInterval?: number;
  enablePerformanceMonitoring?: boolean;
}

export interface AuthOptions {
  headers?: Record<string, string>;
  params?: Record<string, string>;
}

export interface ChannelAuthResponse {
  auth: string;
  channel_data?: string;
}

export interface UserInfo {
  id: string;
  info?: Record<string, any>;
}

export interface PresenceMember {
  id: string;
  info?: Record<string, any>;
}

export interface PresenceChannelData {
  user_id: string;
  user_info?: Record<string, any>;
}

export type ConnectionState = 
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'unavailable'
  | 'failed';

export type ChannelType = 'public' | 'private' | 'presence';

export interface EventCallback {
  (data?: any): void;
}

export interface ConnectionStateChangeEvent {
  previous: ConnectionState;
  current: ConnectionState;
}

export interface LatteStreamEvent {
  event: string;
  data?: any;
  channel?: string;
}