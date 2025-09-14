# LatteStream JavaScript/TypeScript SDK

A powerful, type-safe JavaScript/TypeScript SDK for LatteStream real-time messaging service. This monorepo contains both client-side and server-side SDKs with Pusher-compatible APIs.

## Features

- **Framework Agnostic**: Works with any JavaScript framework or vanilla JS
- **TypeScript First**: Full TypeScript support with comprehensive type definitions
- **Pusher Compatible**: Similar API design for easy migration
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

## Quick Start

### Client Usage

```javascript
import LatteStream from '@lattestream/client';

// Initialize client
const lattestream = new LatteStream('your-app-key', {
  cluster: 'us-east-1',
  authEndpoint: '/auth',
});

// Connect
lattestream.connect();

// Subscribe to a channel
const channel = lattestream.subscribe('my-channel');

// Listen for events
channel.bind('my-event', (data) => {
  console.log('Received:', data);
});
```

### Server Usage

```javascript
import LatteStreamServer from '@lattestream/server';

// Initialize server client
const lattestream = new LatteStreamServer('your-app-key', 'your-master-key');

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

Set up an authentication endpoint for private and presence channels:

```javascript
import { createChannelAuthMiddleware } from '@lattestream/server';

app.post(
  '/auth',
  createChannelAuthMiddleware('your-app-key', 'your-master-key', (req) => ({
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
- `subscribe(channelName)` - Subscribe to a channel
- `unsubscribe(channelName)` - Unsubscribe from a channel
- `bind(eventName, callback)` - Listen for global events
- `getSocketId()` - Get current socket ID
- `getConnectionState()` - Get connection state

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

- `new LatteStreamServer(appKey, masterKey, options)` - Create server instance
- `trigger(channel, event, data)` - Trigger event on channel(s)
- `triggerBatch(events)` - Trigger multiple events
- `getChannelInfo(channel)` - Get channel information
- `getChannels(prefix)` - Get channels by prefix
- `getUsers(presenceChannel)` - Get users in presence channel
- `terminateUserConnections(userId)` - Disconnect user

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
  maxReconnectionAttempts?: number;
  maxReconnectGapInSeconds?: number;
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
}
```

## Examples

Check the `/examples` directory for complete usage examples:

- [Basic Client Usage](./examples/client-basic.js)
- [Server Usage](./examples/server-basic.js)
- [Authentication Middleware](./examples/auth-middleware.js)
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
