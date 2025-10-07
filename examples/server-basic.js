// Basic server usage example
import LatteStreamServer from '@lattestream/server';

// Initialize the server client
const lattestream = new LatteStreamServer(
  'your-app-key',
  'your-master-key',
  {
    cluster: 'eu1',
    useTLS: true,
    enableLogging: true
  }
);

// Trigger an event on a single channel
await lattestream.trigger('my-channel', 'my-event', {
  message: 'Hello World!',
  timestamp: new Date().toISOString()
});

// Trigger an event on multiple channels
await lattestream.trigger(
  ['channel-1', 'channel-2', 'channel-3'],
  'broadcast',
  { announcement: 'Server maintenance in 10 minutes' }
);

// Trigger multiple events in a batch
await lattestream.triggerBatch([
  {
    channel: 'notifications',
    name: 'alert',
    data: { type: 'warning', message: 'Low disk space' }
  },
  {
    channel: 'metrics',
    name: 'update',
    data: { cpu: 85, memory: 72 }
  }
]);

// Get channel information
const channelInfo = await lattestream.getChannelInfo('my-channel', ['user_count']);
console.log('Channel info:', channelInfo);

// Get all channels with a prefix
const channels = await lattestream.getChannels('private-', ['user_count', 'subscription_count']);
console.log('Private channels:', channels);

// Get users in a presence channel
const users = await lattestream.getUsers('presence-chat');
console.log('Users in chat:', users);

// Terminate all connections for a user
await lattestream.terminateUserConnections('user-123');