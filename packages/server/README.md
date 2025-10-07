# @lattestream/server

[![npm version](https://badge.fury.io/js/%40lattestream%2Fserver.svg)](https://www.npmjs.com/package/@lattestream/server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

LatteStream server SDK for Node.js and Deno. Trigger events, authorize channels, and manage real-time connections from your backend.

## Features

- **Secure Authentication** - Channel authorization with encrypted secrets
- **High Performance** - Connection pooling, batching, caching, and retry logic
- **TypeScript First** - Full type safety with comprehensive type definitions
- **Multi-runtime** - Works with Node.js and Deno
- **Event Batching** - Automatic event batching for better performance

## Installation

```bash
npm install @lattestream/server
```

Or with yarn/pnpm:

```bash
yarn add @lattestream/server
pnpm add @lattestream/server
```

## Quick Start

```javascript
import LatteStreamServer from '@lattestream/server';

// Initialize with encrypted secret
const server = new LatteStreamServer('lsk_your_encrypted_secret', {
  cluster: 'eu1',
});

// Trigger an event
await server.trigger('my-channel', 'my-event', {
  message: 'Hello World!',
});
```

## Authentication Keys

Use your **`lsk_*` encrypted secret** (server-side only). Never expose this in client code.

When clients subscribe to private/presence channels, they'll call your auth endpoint. Your server uses `authorizeChannel()` to get an `lspc_*` token from the LatteStream service.

## Triggering Events

### Single Channel

```javascript
await server.trigger('chat-room', 'message', {
  user: 'Alice',
  text: 'Hello!',
});
```

### Multiple Channels

```javascript
await server.trigger(['room-1', 'room-2', 'room-3'], 'notification', { alert: 'Server maintenance in 5 minutes' });
```

### Exclude Socket ID

Useful to exclude the sender from receiving their own event:

```javascript
await server.trigger('chat', 'message', data, {
  socketId: req.body.socket_id, // This socket won't receive the event
});
```

### Batch Events

For triggering multiple different events efficiently:

```javascript
await server.triggerBatch([
  {
    channel: 'channel-1',
    name: 'event-1',
    data: { foo: 'bar' },
  },
  {
    channel: 'channel-2',
    name: 'event-2',
    data: { baz: 'qux' },
    socketId: 'exclude-this-socket',
  },
]);
```

## Channel Authorization

### How Authentication Works

1. **Client connects** with `lspk_*` public key
2. **Client subscribes** to a private/presence channel (must happen within 30 seconds)
3. **Client SDK calls** your `/auth` endpoint with `socket_id` and `channel_name`
4. **Your server calls** `authorizeChannel()` which requests an `lspc_*` token from LatteStream service
5. **LatteStream service** returns the authorization token
6. **Client completes** subscription with the token

### Using authorizeChannel()

```javascript
import LatteStreamServer from '@lattestream/server';

const server = new LatteStreamServer('lsk_your_encrypted_secret');

app.post('/auth', async (req, res) => {
  const { socket_id, channel_name } = req.body;

  // Your authorization logic
  if (!req.user) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    // For presence channels, provide user data
    const userData = channel_name.startsWith('presence-')
      ? { user_id: req.user.id, user_info: { name: req.user.name } }
      : undefined;

    const authResponse = await server.authorizeChannel(socket_id, channel_name, userData);

    res.json(authResponse);
  } catch (error) {
    res.status(403).json({ error: error.message });
  }
});
```

### Express Middleware

For Express.js, use the convenience middleware:

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

## Channel Information

### Get Channel Info

```javascript
const info = await server.getChannelInfo('presence-lobby', ['user_count']);
console.log(info);
// { occupied: true, userCount: 42, subscriptionCount: 42 }
```

### List Channels

```javascript
const channels = await server.getChannels('presence-', ['user_count']);
console.log(channels);
// {
//   channels: {
//     'presence-lobby': { occupied: true, userCount: 42 },
//     'presence-chat': { occupied: true, userCount: 15 }
//   }
// }
```

### Get Presence Users

```javascript
const users = await server.getUsers('presence-lobby');
console.log(users);
// { users: [{ id: 'user-1' }, { id: 'user-2' }] }
```

### Terminate User Connections

```javascript
await server.terminateUserConnections('user-123');
```

## Webhook Verification

Verify webhook signatures from LatteStream:

```javascript
app.post('/webhooks/lattestream', (req, res) => {
  const signature = req.headers['x-lattestream-signature'];
  const payload = JSON.stringify(req.body);

  if (!server.verifyWebhookSignature(payload, signature)) {
    return res.status(401).send('Invalid signature');
  }

  // Process webhook
  const events = req.body.events;
  events.forEach((event) => {
    console.log(`${event.name} on ${event.channel}`);
  });

  res.status(200).send('OK');
});
```

## API Reference

### LatteStreamServer

#### Constructor

```typescript
new LatteStreamServer(encryptedSecret: string, options?: LatteStreamServerOptions)
```

#### Methods

**Events:**

- `trigger(channel, event, data, options?)` - Trigger event on channel(s)
- `triggerBatch(events)` - Trigger multiple events
- `flushBatch()` - Manually flush batched events

**Authorization:**

- `authorizeChannel(socketId, channelName, userData?)` - Authorize private/presence channel

### Helper Functions

```typescript
import { createChannelAuthMiddleware, ServerAuthorizer, EncryptionHelper, createAuthHelper } from '@lattestream/server';
```

- `createChannelAuthMiddleware(secret, getUserData?)` - Create Express auth middleware (NOTE: this is NOT encrypted. Recommend to use `authorizeChannel()` instead)
- `ServerAuthorizer` - Manual authorization class (advanced)
- `EncryptionHelper` - Encryption utilities (advanced)
- `createAuthHelper(masterKey)` - Create encryption helper (advanced)

## Configuration Options

```typescript
interface LatteStreamServerOptions {
  wsEndpoint?: string; // Custom WebSocket endpoint
  cluster?: string; // Cluster region (default: 'eu1')
  useTLS?: boolean; // Use TLS (default: true)
  enableLogging?: boolean; // Enable debug logging
  timeout?: number; // Request timeout in ms (default: 30000)

  // Connection pooling
  maxConnections?: number; // Max concurrent connections (default: 20)
  connectionMaxAge?: number; // Connection max age in ms (default: 300000)

  // Caching
  cacheTimeout?: number; // Cache timeout in ms (default: 30000)

  // Retry logic
  maxRetries?: number; // Max retry attempts (default: 3)
  retryDelay?: number; // Retry delay in ms (default: 1000)

  // Event batching
  enableBatching?: boolean; // Enable event batching (default: true)
  batchSize?: number; // Max batch size (default: 50)
  batchInterval?: number; // Batch interval in ms (default: 100)
}
```

## Performance Features

### Automatic Event Batching

Events are automatically batched for better performance:

```javascript
// These will be batched together
await server.trigger('channel-1', 'event', { data: 1 });
await server.trigger('channel-2', 'event', { data: 2 });
await server.trigger('channel-3', 'event', { data: 3 });

// Force immediate flush
await server.flushBatch();
```

Disable batching if needed:

```javascript
const server = new LatteStreamServer('lsk_secret', {
  enableBatching: false,
});
```

### Connection Pooling

Connections are automatically pooled and reused for better performance.

### Request Caching

Channel info and user queries are cached automatically (30s default):

```javascript
const server = new LatteStreamServer('lsk_secret', {
  cacheTimeout: 60000, // Cache for 60 seconds
});
```

### Advanced Performance Utilities

```javascript
import { ConnectionPool, BatchProcessor, RequestCache, createRetryWrapper, MemoryMonitor } from '@lattestream/server';

// Use these for custom implementations
```

## Examples

### Express.js API

```javascript
import express from 'express';
import LatteStreamServer from '@lattestream/server';

const app = express();
const server = new LatteStreamServer('lsk_your_secret');

app.use(express.json());

// Trigger event endpoint
app.post('/api/message', async (req, res) => {
  try {
    await server.trigger(
      'chat',
      'message',
      {
        user: req.user.name,
        text: req.body.text,
      },
      {
        socketId: req.body.socket_id, // Exclude sender
      }
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Auth endpoint
app.post('/auth', async (req, res) => {
  const { socket_id, channel_name } = req.body;

  const authResponse = await server.authorizeChannel(socket_id, channel_name, { user_id: req.user.id });

  res.json(authResponse);
});

app.listen(3000);
```

### Next.js API Route

```javascript
// pages/api/lattestream/trigger.js
import LatteStreamServer from '@lattestream/server';

const server = new LatteStreamServer(process.env.LATTESTREAM_SECRET);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await server.trigger('notifications', 'alert', req.body);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

### Deno

```typescript
import LatteStreamServer from 'npm:@lattestream/server';

const server = new LatteStreamServer(Deno.env.get('LATTESTREAM_SECRET')!);

Deno.serve(async (req) => {
  if (req.method === 'POST' && new URL(req.url).pathname === '/trigger') {
    const data = await req.json();

    await server.trigger('channel', 'event', data);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Not found', { status: 404 });
});
```

## TypeScript

This package includes TypeScript definitions out of the box.

```typescript
import LatteStreamServer, {
  LatteStreamServerOptions,
  TriggerEventOptions,
  BatchTriggerEvent,
  ChannelInfo,
} from '@lattestream/server';

const server: LatteStreamServer = new LatteStreamServer('lsk_secret', {
  cluster: 'eu1',
  enableBatching: true,
});
```

## Environment Variables

```bash
# .env
LATTESTREAM_SECRET=lsk_your_encrypted_secret
LATTESTREAM_CLUSTER=eu1
```

```javascript
const server = new LatteStreamServer(process.env.LATTESTREAM_SECRET, {
  cluster: process.env.LATTESTREAM_CLUSTER,
});
```

## Related Packages

- [@lattestream/client](https://www.npmjs.com/package/@lattestream/client) - Client SDK for browsers and frontend frameworks

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Links

- [Documentation](https://docs.lattestream.com)
- [GitHub Repository](https://github.com/lattestream/lattestream-js)
- [NPM Package](https://www.npmjs.com/package/@lattestream/server)
- [Report Issues](https://github.com/lattestream/lattestream-js/issues)
