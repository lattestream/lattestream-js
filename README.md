# LatteStream JavaScript/TypeScript SDK

A powerful, type-safe JavaScript/TypeScript SDK for LatteStream real-time messaging service. This monorepo contains both client-side and server-side SDKs with Pusher-style APIs.

## Features

- **Framework Agnostic**: Works with any JavaScript framework or vanilla JS
- **TypeScript First**: Full TypeScript support with comprehensive type definitions
- **Pusher-style API**: Similar API design for easy migration
- **Real-time Authentication**: Server-side channel authorization
- **Presence Channels**: Track who's online with user presence
- **Auto-reconnection**: Robust connection handling with exponential backoff
- **Master Key Encryption**: Secure communication with shared encryption
- **Node.js & Deno**: Server SDK supports both runtimes

## Installation

### Client SDK (Frontend)

```bash
npm install @lattestream/client
# or
yarn add @lattestream/client
# or
pnpm add @lattestream/client
```

### Server SDK (Backend)

```bash
npm install @lattestream/server
# or
yarn add @lattestream/server
# or
pnpm add @lattestream/server
```

## Authentication Keys

LatteStream uses different authentication keys for client and server:

### Key Types

- **`lsk_*` - Encrypted Secret (Server-side only)**
  Your private key used for server-side operations. Never expose this in client code.

- **`lspk_*` - Public Key (Client-side only)**
  Public key for client connections. Use with `authEndpoint` for private/presence channel authorization.

- **`lspc_*` - Channel Authorization Token (Internal)**
  Generated automatically by LatteStream service when `authorizeChannel()` is called. Developers don't generate these directly.

### When to Use Each Key

| Key Type | Used In    | Access Level                                                |
| -------- | ---------- | ----------------------------------------------------------- |
| `lsk_*`  | Server SDK | Full access (trigger events, authorize channels, etc.)      |
| `lspk_*` | Client SDK | All channels (requires `authEndpoint` for private/presence) |
| `lspc_*` | Internal   | Auto-generated during channel authorization                 |

## Quick Start

### Client Usage

```javascript
import LatteStream from '@lattestream/client';

// Initialize with public key
const lattestream = new LatteStream('lspk_your_public_key', {
  cluster: 'eu1',
  authEndpoint: '/auth', // Required for private/presence channels
});

// Connect
lattestream.connect();

// Subscribe to a channel (must subscribe within 30 seconds or connection times out)
const channel = lattestream.subscribe('my-channel');

// Listen for events
channel.bind('my-event', (data) => {
  console.log('Received:', data);
});
```

### Server Usage

```javascript
import LatteStreamServer from '@lattestream/server';

// Initialize server client with encrypted secret
const lattestream = new LatteStreamServer('lsk_your_encrypted_secret', {
  cluster: 'eu1',
});

// Trigger an event
await lattestream.trigger('my-channel', 'my-event', {
  message: 'Hello World!',
});
```

## Channel Types

### Public Channels

No authentication required. Anyone can subscribe.

```javascript
const channel = lattestream.subscribe('public-updates');
```

### Private Channels

Require authentication. Channel names must start with `private-`.

```javascript
const channel = lattestream.subscribe('private-notifications');
```

### Presence Channels

**CAUTION!: Webhooks are currently in development. Presence channels currently function as private channels with extra metadata**

Track online users. Channel names must start with `presence-`.

```javascript
const channel = lattestream.subscribe('presence-chat');

channel.bind('lattestream:member_added', (member) => {
  console.log('User joined:', member);
});

channel.bind('lattestream:member_removed', (member) => {
  console.log('User left:', member);
});
```

## Authentication

### How Authentication Works

1. **Client connects** with `lspk_*` public key
2. **Client subscribes** to a private/presence channel (must happen within 30 seconds)
3. **Client SDK calls** your `/auth` endpoint with `socket_id` and `channel_name`
4. **Your server calls** `authorizeChannel()` which requests an `lspc_*` token from LatteStream service
5. **LatteStream service** returns the authorization token
6. **Client completes** subscription with the token

### Server-side Channel Authorization

Use the `authorizeChannel()` method to authorize private and presence channels. This method internally requests an `lspc_*` token from the LatteStream service:

```javascript
import LatteStreamServer from '@lattestream/server';

const lattestream = new LatteStreamServer('lsk_your_encrypted_secret');

app.post('/auth', async (req, res) => {
  const { socket_id, channel_name } = req.body;

  // Your authorization logic here
  if (!req.user) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    // For presence channels, provide user data
    const userData = channel_name.startsWith('presence-')
      ? { user_id: req.user.id, user_info: { name: req.user.name } }
      : undefined;

    const authResponse = await lattestream.authorizeChannel(socket_id, channel_name, userData);

    res.json(authResponse);
  } catch (error) {
    res.status(403).json({ error: error.message });
  }
});
```

### Express Middleware

Alternatively, use the convenience middleware for Express.js:

```javascript
import { createChannelAuthMiddleware } from '@lattestream/server';

app.post(
  '/auth',
  createChannelAuthMiddleware('lsk_your_encrypted_secret', (req) => ({
    user_id: req.user.id,
    user_info: { name: req.user.name },
  }))
);
```

## API Reference

### Client SDK

#### LatteStream

- `new LatteStream(appKey, options)` - Create client instance
- `connect()` - Connect to LatteStream
- `disconnect()` - Disconnect from LatteStream
- `subscribe(channelName, authOptions?)` - Subscribe to a channel
- `unsubscribe(channelName)` - Unsubscribe from a channel
- `bind(eventName, callback)` - Listen for global events
- `unbind(eventName?, callback?)` - Remove global event listeners
- `getSocketId()` - Get current socket ID
- `getConnectionState()` - Get connection state
- `getReconnectionAttempts()` - Get number of reconnection attempts
- `forceReconnect()` - Force immediate reconnection

#### Channel

- `bind(eventName, callback)` - Listen for channel events
- `unbind(eventName, callback)` - Stop listening for events
- `trigger(eventName, data)` - Trigger client event (private/presence only)

#### PresenceChannel

- `getMembers()` - Get all online members
- `getMember(id)` - Get specific member
- `getMyId()` - Get your user ID
- `getMemberCount()` - Get member count

### Server SDK

#### LatteStreamServer

- `new LatteStreamServer(encryptedSecret, options)` - Create server instance
- `trigger(channel, event, data, options?)` - Trigger event on channel(s)
- `triggerBatch(events)` - Trigger multiple events
- `authorizeChannel(socketId, channelName, userData?)` - Authorize private/presence channel
- `getChannelInfo(channel, info?)` - Get channel information
- `getChannels(filterByPrefix?, info?)` - Get channels by prefix
- `getUsers(presenceChannel)` - Get users in presence channel
- `terminateUserConnections(userId)` - Disconnect user
- `generateWebhookSignature(payload)` - Generate webhook signature
- `verifyWebhookSignature(payload, signature)` - Verify webhook signature
- `flushBatch()` - Manually flush batched events
- `destroy()` - Clean up resources and connections

## Configuration Options

### Client Options

```typescript
interface LatteStreamOptions {
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
  enableBatching?: boolean; // Enable event batching
  batchSize?: number; // Max batch size
  batchInterval?: number; // Batch interval in ms
  enablePerformanceMonitoring?: boolean;
}
```

### Server Options

```typescript
interface LatteStreamServerOptions {
  wsEndpoint?: string;
  cluster?: string;
  useTLS?: boolean;
  enableLogging?: boolean;
  timeout?: number;
  maxConnections?: number; // Max concurrent connections (default: 20)
  connectionMaxAge?: number; // Connection max age in ms (default: 300000)
  cacheTimeout?: number; // Cache timeout in ms (default: 30000)
  maxRetries?: number; // Max retry attempts (default: 3)
  retryDelay?: number; // Retry delay in ms (default: 1000)
  enableBatching?: boolean; // Enable event batching (default: true)
  batchSize?: number; // Max batch size (default: 50)
  batchInterval?: number; // Batch interval in ms (default: 100)
}
```

## Advanced Features

### Lazy Loading

For code splitting and dynamic imports, use the `LazyLatteStream` utilities:

```javascript
import { LazyLatteStream } from '@lattestream/client';

// Lazy load the client
const client = await LazyLatteStream.createClient('your-app-key', options);
```

### Performance Utilities

The SDK exports performance utilities for advanced use cases:

```javascript
import {
  MessageQueue,
  ObjectPool,
  FastEventEmitter,
  PerformanceMonitor,
  debounce,
  throttle,
} from '@lattestream/client';
```

For server-side performance utilities:

```javascript
import { ConnectionPool, BatchProcessor, RequestCache, createRetryWrapper, MemoryMonitor } from '@lattestream/server';
```

## Examples

Check the `/examples` directory for complete usage examples:

- [Basic Client Usage](./examples/client-basic.js)
- [Server Usage](./examples/server-basic.js)
- [Authentication Middleware](./examples/auth-middleware.js)
- [Token-based Authentication](./examples/token-based-auth.js)
- [Webhook Handling](./examples/webhook-handler.js)

## Development

This is a pnpm monorepo. To get started:

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run type checking
pnpm typecheck
```

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Support

- Documentation: [https://docs.lattestream.com](https://docs.lattestream.com)
- GitHub Issues: [https://github.com/lattestream/lattestream-js/issues](https://github.com/lattestream/lattestream-js/issues)
- Discord: [https://discord.gg/lattestream](https://discord.gg/lattestream)
