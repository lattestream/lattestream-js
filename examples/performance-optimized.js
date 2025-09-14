// High-performance LatteStream usage example
import LatteStream, { PerformanceMonitor } from '@lattestream/client';
import LatteStreamServer, { MemoryMonitor } from '@lattestream/server';

// Client-side performance optimization
const client = new LatteStream('your-app-key', {
  cluster: 'us-east-1',
  forceTLS: true,
  enableLogging: false, // Disable logging in production
  
  // Performance optimizations
  enableBatching: true,        // Enable message batching
  batchSize: 10,              // Batch up to 10 messages
  batchInterval: 16,          // ~60fps batching
  enablePerformanceMonitoring: true,
  
  // Connection optimizations
  activityTimeout: 120000,    // 2 minutes
  pongTimeout: 30000,         // 30 seconds
  maxReconnectionAttempts: 6,
  maxReconnectGapInSeconds: 30
});

// Performance monitoring
const perfMonitor = new PerformanceMonitor();
client.bind('connection_state_change', () => {
  const timing = perfMonitor.startTiming('connection_change');
  // Handle connection change
  timing(); // End timing
});

// Efficient channel management
const channels = new Map();

function getOrCreateChannel(channelName) {
  if (!channels.has(channelName)) {
    const channel = client.subscribe(channelName);
    channels.set(channelName, channel);
    
    // Use throttled event handlers for high-frequency events
    const throttledHandler = throttle((data) => {
      console.log('Throttled event:', data);
    }, 100); // Max once per 100ms
    
    channel.bind('high-frequency-event', throttledHandler);
  }
  return channels.get(channelName);
}

// Server-side high performance
const server = new LatteStreamServer('your-app-key', 'your-master-key', {
  cluster: 'us-east-1',
  useTLS: true,
  enableLogging: false,
  
  // Performance optimizations
  enableBatching: true,      // Batch server events
  batchSize: 50,            // Larger batches for server
  batchInterval: 100,       // 100ms batching
  
  // Connection optimizations
  maxConnections: 20,       // Connection pool size
  connectionMaxAge: 300000, // 5 minutes
  cacheTimeout: 30000,      // 30 second cache
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 30000
});

// Memory monitoring for server
const memoryMonitor = new MemoryMonitor();
memoryMonitor.start(10000); // Monitor every 10 seconds

setInterval(() => {
  const stats = memoryMonitor.getStats();
  if (stats && stats.current > 100 * 1024 * 1024) { // 100MB threshold
    console.warn('High memory usage:', stats);
  }
}, 30000);

// High-performance event triggering
async function triggerHighVolumeEvents() {
  const events = [];
  
  // Prepare batch of events
  for (let i = 0; i < 100; i++) {
    events.push({
      channel: `channel-${i % 10}`,
      name: 'bulk-update',
      data: { id: i, timestamp: Date.now() }
    });
  }
  
  // Trigger in optimized batches
  const batchSize = 10;
  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    await server.triggerBatch(batch);
  }
}

// Lazy loading example
async function loadChannelOnDemand(channelName) {
  const { LazyLatteStream } = await import('@lattestream/client');
  const lazyClient = await LazyLatteStream.createClient('your-app-key', {
    cluster: 'us-east-1'
  });
  
  return lazyClient.subscribe(channelName);
}

// Cleanup on shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  
  // Flush any pending batches
  await server.flushBatch();
  
  // Stop monitoring
  memoryMonitor.stop();
  
  // Cleanup resources
  server.destroy();
  client.disconnect();
  
  process.exit(0);
});

// Performance benchmark
async function benchmark() {
  const startTime = Date.now();
  const promises = [];
  
  // Trigger 1000 events concurrently
  for (let i = 0; i < 1000; i++) {
    promises.push(
      server.trigger(`test-${i % 10}`, 'benchmark', { 
        id: i, 
        timestamp: Date.now() 
      })
    );
  }
  
  await Promise.all(promises);
  
  const endTime = Date.now();
  console.log(`Triggered 1000 events in ${endTime - startTime}ms`);
  
  // Show performance stats
  const connectionStats = perfMonitor.getStats('connection_change');
  if (connectionStats) {
    console.log('Connection change stats:', connectionStats);
  }
}

// Run benchmark
benchmark().catch(console.error);