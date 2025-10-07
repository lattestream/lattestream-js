/**
 * Example demonstrating binary message handling in LatteStream
 * This example shows how LatteStream can handle both text and binary protocol messages
 */

const { LatteStream } = require('../packages/client/dist');

// Example usage with your LatteStream client
const client = new LatteStream('your-app-key-or-token', {
  wsEndpoint: 'eu1.lattestream.com',
  enableLogging: true,
  // Enhanced reconnection options
  maxReconnectionAttempts: 10,
  maxReconnectGapInSeconds: 60,
  reconnectBaseDelay: 1000,
  reconnectBackoffMultiplier: 1.5,
  reconnectJitter: true
});

// Connect to LatteStream
client.connect();

// Subscribe to a channel
const channel = client.subscribe('test-channel');

// Handle different types of messages
channel.bind('text-message', (data) => {
  console.log('Received text message:', data);
  console.log('Data type:', typeof data);
  console.log('Is parsed object:', typeof data === 'object' && data !== null);
});

channel.bind('json-data', (data) => {
  console.log('Received JSON data:', data);
  console.log('Data type:', typeof data);
  
  // If the server sent JSON as a string like '{"userId": 123, "message": "hello"}'
  // LatteStream will automatically parse it to: {userId: 123, message: "hello"}
  if (typeof data === 'object' && data.userId) {
    console.log('✅ JSON automatically parsed! User ID:', data.userId);
    console.log('✅ Message content:', data.message);
  }
});

channel.bind('array-data', (data) => {
  console.log('Received array data:', data);
  console.log('Data type:', typeof data);
  console.log('Is array:', Array.isArray(data));
  
  // If server sent JSON array like '[1, 2, 3, "test"]'
  // LatteStream will automatically parse it to: [1, 2, 3, "test"]
  if (Array.isArray(data)) {
    console.log('✅ JSON array automatically parsed! Length:', data.length);
    console.log('✅ First item:', data[0]);
  }
});

channel.bind('binary-message', (data) => {
  console.log('Received binary message:', data);
  
  // If the message contains binary data, it will be available in the binaryData property
  if (data.binaryData) {
    console.log('Binary data length:', data.binaryData.length);
    console.log('Binary data type:', data.binaryData.constructor.name);
    
    // Example: Convert binary data to base64 for logging
    const base64 = btoa(String.fromCharCode(...data.binaryData));
    console.log('Binary data as base64:', base64.substring(0, 100) + '...');
  }
});

// Handle raw string data (non-JSON)
channel.bind('raw-text', (data) => {
  console.log('Received raw text:', data);
  console.log('Data type:', typeof data);
  
  // If server sends plain text like "Hello World", you get the string as-is
  if (typeof data === 'string') {
    console.log('✅ Raw text preserved:', data);
  }
});

// Handle connection state changes
client.bind('connection_state_change', (event) => {
  console.log('Connection state changed:', event.previous, '->', event.current);
  
  if (event.current === 'unavailable') {
    console.log(`Reconnection attempts: ${client.getReconnectionAttempts()}`);
  } else if (event.current === 'failed') {
    console.log('Connection failed after maximum attempts. You can manually retry with client.forceReconnect()');
  }
});

// Example: Force reconnection after 30 seconds if connection fails
setTimeout(() => {
  if (client.getConnectionState() === 'failed') {
    console.log('Forcing reconnection...');
    client.forceReconnect();
  }
}, 30000);

console.log('LatteStream client configured with automatic JSON parsing!');
console.log('\n🎯 Key Features:');
console.log('✅ Automatic JSON parsing for server messages');
console.log('✅ Binary protocol support (Types 0x01, 0x02, 0x03)');
console.log('✅ Mixed binary/text message handling');
console.log('✅ Intelligent fallback parsing');
console.log('✅ Preserved raw text for non-JSON data');

console.log('\n📨 Message Processing:');
console.log('Server sends: \'{"userId": 123}\' → You receive: {userId: 123}');
console.log('Server sends: \'[1,2,3]\' → You receive: [1,2,3]');
console.log('Server sends: "Hello" → You receive: "Hello"');
console.log('Server sends: Binary + JSON → You receive: {event: "...", binaryData: Uint8Array}');

console.log('\n🔧 Supported Formats:');
console.log('• Text JSON: {"event":"test","data":"hello world"}');
console.log('• Binary Type 0x01: [01 00 00 00][length][JSON bytes]');
console.log('• Binary Type 0x02: [02 00 00 00][length][metadata_length][JSON metadata][binary data]');
console.log('• Mixed Blob: Blob containing JSON strings');

console.log('\n🚀 Ready to receive messages! Check the event handlers above for examples.');