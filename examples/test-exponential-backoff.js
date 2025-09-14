const { LatteStream } = require('../packages/client/src/index');

// Test exponential backoff for authentication failures
const testExponentialBackoff = async () => {
  console.log('===========================================');
  console.log('LatteStream Exponential Backoff Testing');
  console.log('===========================================\n');

  const startTime = Date.now();
  const reconnectTimestamps = [];

  // Create client with invalid credentials to simulate auth failure
  const client = new LatteStream('invalid_token_will_fail', {
    wsEndpoint: 'localhost:3001/websocket',
    forceTLS: false,
    enableLogging: true,
    maxReconnectionAttempts: 5,
    reconnectBaseDelay: 1000,        // Start with 1 second
    reconnectBackoffMultiplier: 2,   // Double each time
    maxReconnectGapInSeconds: 30,    // Max 30 seconds
    reconnectJitter: false            // Disable jitter for predictable testing
  });

  // Track state changes and reconnection attempts
  client.connection.bind('state_change', (states) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${elapsed}s] State Change: ${states.previous} -> ${states.current}`);

    if (states.current === 'connecting' && states.previous !== 'disconnected') {
      reconnectTimestamps.push(Date.now());
      const attempt = client.connection.getReconnectionAttempts();
      console.log(`  → Reconnection attempt #${attempt}`);

      if (reconnectTimestamps.length > 1) {
        const lastDelay = reconnectTimestamps[reconnectTimestamps.length - 1] -
                         reconnectTimestamps[reconnectTimestamps.length - 2];
        console.log(`  → Delay since last attempt: ${(lastDelay / 1000).toFixed(1)}s`);
      }
    }

    if (states.current === 'failed') {
      console.log('\n✓ Connection marked as failed after max attempts');
      showResults();
    }
  });

  const showResults = () => {
    console.log('\n=== Exponential Backoff Analysis ===');
    console.log(`Total attempts: ${client.connection.getReconnectionAttempts()}`);
    console.log('\nExpected delays with 2x multiplier:');
    console.log('  Attempt 1: immediate (first connection)');
    console.log('  Attempt 2: ~1s delay');
    console.log('  Attempt 3: ~2s delay');
    console.log('  Attempt 4: ~4s delay');
    console.log('  Attempt 5: ~8s delay');

    console.log('\nActual delays observed:');
    for (let i = 1; i < reconnectTimestamps.length; i++) {
      const delay = (reconnectTimestamps[i] - reconnectTimestamps[i-1]) / 1000;
      const expected = Math.pow(2, i-1);
      const variance = Math.abs(delay - expected);
      const status = variance < 0.5 ? '✓' : '✗';
      console.log(`  Attempt ${i+1}: ${delay.toFixed(1)}s (expected ~${expected}s) ${status}`);
    }

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`\nTotal test duration: ${totalTime.toFixed(1)}s`);

    // Calculate if backoff worked correctly
    const delaysCorrect = reconnectTimestamps.slice(1).every((timestamp, i) => {
      if (i === 0) return true;
      const delay = (timestamp - reconnectTimestamps[i]) / 1000;
      const expected = Math.pow(2, i);
      return Math.abs(delay - expected) < 1; // Allow 1s variance
    });

    if (delaysCorrect) {
      console.log('\n✅ SUCCESS: Exponential backoff working correctly');
    } else {
      console.log('\n⚠️  WARNING: Backoff delays may not be exponential');
    }

    process.exit(0);
  };

  // Start the connection
  console.log('Starting connection with invalid credentials...\n');
  client.connect();

  // Safety timeout
  setTimeout(() => {
    console.log('\n⚠️  Test timeout after 60 seconds');
    showResults();
  }, 60000);
};

// Run the test
testExponentialBackoff();
