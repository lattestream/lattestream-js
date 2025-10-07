# @lattestream/client

[![npm version](https://badge.fury.io/js/%40lattestream%2Fclient.svg)](https://www.npmjs.com/package/@lattestream/client)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

LatteStream client SDK for browsers and frontend frameworks. Real-time messaging with WebSocket support, Pusher-style API, and TypeScript-first design.

## Features

- **Framework Agnostic** - Works with React, Vue, Angular, Svelte, or vanilla JS
- **TypeScript First** - Full type safety with comprehensive type definitions
- **Auto-reconnection** - Robust connection handling with exponential backoff
- **Channel Authentication** - Built-in support for private and presence channels
- **Presence Channels** - Track who's online with user presence
- **Performance Optimized** - Event batching, object pooling, and lazy loading
- **Tiny Bundle Size** - Optimized for modern bundlers

## Installation

```bash
npm install @lattestream/client
```

Or with yarn/pnpm:

```bash
yarn add @lattestream/client
# or
pnpm add @lattestream/client
```

## Quick Start

```javascript
import LatteStream from '@lattestream/client';

// Initialize with public key
const client = new LatteStream('lspk_your_public_key', {
  cluster: 'eu1',
  authEndpoint: '/auth', // Required for private/presence channels
});

// Connect
client.connect();

// Subscribe to a channel (must subscribe within 30 seconds)
const channel = client.subscribe('private-channel-name');

// Listen for events
channel.bind('client-example-event', (data) => {
  console.log('Received:', data);
});

// Trigger client events (private/presence channels only)
channel.trigger('client-example-event', { message: 'Hello!' });
```

## Channel Types

### Public Channels

No authentication required. Anyone can subscribe.

```javascript
const channel = client.subscribe('public-updates');
channel.bind('announcement', (data) => {
  console.log('Announcement:', data);
});
```

### Private Channels

Require authentication via your auth endpoint. Channel names must start with `private-`.

```javascript
const channel = client.subscribe('private-user-123');
channel.bind('message', (data) => {
  console.log('Private message:', data);
});
```

### Presence Channels

Track online users. Channel names must start with `presence-`.

> **Note:** Webhooks are currently in development. Presence channels currently function as private channels with extra metadata.

```javascript
const channel = client.subscribe('presence-chat');

// Listen for members joining
channel.bind('lattestream:member_added', (member) => {
  console.log('User joined:', member);
});

// Listen for members leaving
channel.bind('lattestream:member_removed', (member) => {
  console.log('User left:', member);
});

// Get current members
const members = channel.getMembers();
console.log('Online users:', members);
```

## API Reference

### LatteStream

#### Constructor

```typescript
new LatteStream(appKey: string, options?: LatteStreamOptions)
```

#### Methods

- `connect()` - Connect to LatteStream
- `disconnect()` - Disconnect from LatteStream
- `subscribe(channelName: string, authOptions?: AuthOptions)` - Subscribe to a channel
- `unsubscribe(channelName: string)` - Unsubscribe from a channel
- `bind(eventName: string, callback: EventCallback)` - Listen for global events
- `unbind(eventName?: string, callback?: EventCallback)` - Remove global event listeners
- `getSocketId()` - Get current socket ID
- `getConnectionState()` - Get connection state
- `getReconnectionAttempts()` - Get number of reconnection attempts
- `forceReconnect()` - Force immediate reconnection

### Channel

#### Methods

- `bind(eventName: string, callback: EventCallback)` - Listen for channel events
- `unbind(eventName?: string, callback?: EventCallback)` - Stop listening for events
- `trigger(eventName: string, data?: any)` - Trigger client event (private/presence only)
- `isSubscribed()` - Check if subscribed
- `getType()` - Get channel type ('public', 'private', or 'presence')

### PresenceChannel

Extends `Channel` with presence-specific methods:

- `getMembers()` - Get all online members
- `getMember(id: string)` - Get specific member
- `getMyId()` - Get your user ID
- `getMemberCount()` - Get member count

## Configuration Options

```typescript
interface LatteStreamOptions {
  wsEndpoint?: string; // Custom WebSocket endpoint
  authEndpoint?: string; // Auth endpoint for private/presence channels
  cluster?: string; // Cluster region (default: 'eu1')
  forceTLS?: boolean; // Force TLS connection
  enableLogging?: boolean; // Enable debug logging
  activityTimeout?: number; // Activity timeout in ms
  pongTimeout?: number; // Pong timeout in ms
  unavailableTimeout?: number; // Unavailable timeout in ms
  maxReconnectionAttempts?: number; // Max reconnection attempts
  maxReconnectGapInSeconds?: number; // Max gap between reconnections
  reconnectBaseDelay?: number; // Base delay in ms (default: 1000)
  reconnectBackoffMultiplier?: number; // Backoff multiplier (default: 2)
  reconnectJitter?: boolean; // Add random jitter (default: true)
  enableBatching?: boolean; // Enable event batching
  batchSize?: number; // Max batch size
  batchInterval?: number; // Batch interval in ms
  enablePerformanceMonitoring?: boolean;
}
```

## Connection States

The client can be in one of these states:

- `connecting` - Attempting to connect
- `connected` - Successfully connected
- `disconnected` - Disconnected
- `unavailable` - Connection unavailable
- `failed` - Connection failed

Listen for state changes:

```javascript
client.bind('connection_state_change', (event) => {
  console.log(`${event.previous} -> ${event.current}`);
});
```

## Authentication

For private and presence channels, set up an auth endpoint on your server:

```javascript
// Client side
const client = new LatteStream('lspk_your_public_key', {
  authEndpoint: '/auth',
});

const channel = client.subscribe('private-user-123');
```

Your server should handle the auth request and use [@lattestream/server](https://www.npmjs.com/package/@lattestream/server) to authorize:

```javascript
// Server side (see @lattestream/server docs)
import LatteStreamServer from '@lattestream/server';

const server = new LatteStreamServer('lsk_your_encrypted_secret');

app.post('/auth', async (req, res) => {
  const { socket_id, channel_name } = req.body;

  // Your authorization logic
  const authResponse = await server.authorizeChannel(
    socket_id,
    channel_name,
    userData // For presence channels
  );

  res.json(authResponse);
});
```

## Advanced Features

### Lazy Loading

For code splitting and dynamic imports:

```javascript
import { LazyLatteStream } from '@lattestream/client';

// Lazy load the client
const client = await LazyLatteStream.createClient('lspk_your_key', options);
```

### Performance Utilities

Export performance utilities for advanced use cases:

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

## Examples

### React Integration

```jsx
import { useEffect, useState } from 'react';
import LatteStream from '@lattestream/client';

function App() {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const client = new LatteStream('lspk_your_key', {
      authEndpoint: '/auth',
    });

    client.connect();
    const channel = client.subscribe('chat');

    channel.bind('message', (data) => {
      setMessages((prev) => [...prev, data]);
    });

    return () => {
      client.disconnect();
    };
  }, []);

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>{msg.text}</div>
      ))}
    </div>
  );
}
```

### Vue Integration

```vue
<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import LatteStream from '@lattestream/client';

const messages = ref([]);
let client;

onMounted(() => {
  client = new LatteStream('lspk_your_key', {
    authEndpoint: '/auth',
  });

  client.connect();
  const channel = client.subscribe('private-chat');

  channel.bind('message', (data) => {
    messages.value.push(data);
  });
});

onUnmounted(() => {
  if (client) client.disconnect();
});
</script>

<template>
  <div v-for="(msg, i) in messages" :key="i">
    {{ msg.text }}
  </div>
</template>
```

## Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- iOS Safari (latest 2 versions)
- Chrome for Android (latest 2 versions)

## TypeScript

This package includes TypeScript definitions out of the box. No need for `@types` packages.

```typescript
import LatteStream, { Channel, PresenceChannel, LatteStreamOptions, ConnectionState } from '@lattestream/client';

const client: LatteStream = new LatteStream('lspk_key', {
  cluster: 'eu1',
});
```

## Related Packages

- [@lattestream/server](https://www.npmjs.com/package/@lattestream/server) - Server SDK for Node.js and Deno

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Links

- [Documentation](https://docs.lattestream.com)
- [GitHub Repository](https://github.com/lattestream/lattestream-js)
- [NPM Package](https://www.npmjs.com/package/@lattestream/client)
- [Report Issues](https://github.com/lattestream/lattestream-js/issues)
