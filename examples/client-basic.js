// Basic client usage example
import LatteStream from '@lattestream/client';

// Option 1: Public key for public channels only (lspk_)
const publicClient = new LatteStream('lspk_your_public_key_here', {
  wsHost: 'localhost',
  wsPort: 8080,
  forceTLS: false,
  enableLogging: true
  // No authEndpoint needed - public channels only
});

// Option 2: Full token-based authentication (lspc_) - supports all channel types
// First get a token from your server (see token-based-auth.js example)
/*
const response = await fetch('/api/client-token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'current-user-id' })
});
const { accessToken } = await response.json();

const lattestream = new LatteStream(accessToken, {
  wsHost: 'localhost',
  wsPort: 8080,
  forceTLS: false,
  enableLogging: true,
  authEndpoint: '/auth' // Needed for private/presence channels
});
*/

// Option 3: Legacy app key authentication (for backward compatibility)
/*
const lattestream = new LatteStream('your-legacy-app-key', {
  cluster: 'us-east-1',
  forceTLS: true,
  enableLogging: true,
  authEndpoint: '/auth' // Required for private/presence channels
});
*/

// Connect to LatteStream
publicClient.connect();

// Listen for connection state changes
publicClient.bind('connection_state_change', (event) => {
  console.log('Connection state changed:', event.previous, '->', event.current);
});

// Subscribe to a public channel (works with lspk_ public key)
const publicChannel = publicClient.subscribe('my-channel');

// Listen for events on the channel
publicChannel.bind('my-event', (data) => {
  console.log('Received event:', data);
});

// Subscribe to a private channel (requires authentication)
const privateChannel = lattestream.subscribe('private-notifications');
privateChannel.bind('new-notification', (data) => {
  console.log('New notification:', data);
});

// Subscribe to a presence channel
const presenceChannel = lattestream.subscribe('presence-chat');

// Listen for presence events
presenceChannel.bind('lattestream:member_added', (member) => {
  console.log('User joined:', member);
});

presenceChannel.bind('lattestream:member_removed', (member) => {
  console.log('User left:', member);
});

presenceChannel.bind('lattestream:subscription_succeeded', (data) => {
  console.log('Current members:', presenceChannel.getMembers());
  console.log('My ID:', presenceChannel.getMyId());
});

// Trigger client events (only works on private/presence channels)
privateChannel.trigger('typing', { user: 'john', isTyping: true });

// Disconnect when done
// lattestream.disconnect();