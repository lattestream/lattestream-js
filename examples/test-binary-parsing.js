/**
 * Test utility for binary message parsing
 * This helps verify that JSON in binary format is properly parsed
 */

const { parseBinaryMessage, createBinaryMessage, isBinaryMessage } = require('../packages/client/src/binary-protocol');

async function testBinaryParsing() {
  console.log('=== Testing Binary Message Parsing ===\n');

  // Test 1: JSON string in binary format (Blob)
  console.log('Test 1: JSON in Blob format');
  const jsonMessage = { event: 'test-event', data: 'hello world' };
  const jsonString = JSON.stringify(jsonMessage);
  const jsonBlob = new Blob([jsonString], { type: 'application/json' });
  
  try {
    const parsed1 = await parseBinaryMessage(jsonBlob);
    console.log('✅ Parsed JSON from Blob:', parsed1);
  } catch (error) {
    console.log('❌ Failed to parse JSON from Blob:', error.message);
  }

  // Test 2: JSON string in ArrayBuffer format
  console.log('\nTest 2: JSON in ArrayBuffer format');
  const encoder = new TextEncoder();
  const jsonArrayBuffer = encoder.encode(jsonString).buffer;
  
  try {
    const parsed2 = await parseBinaryMessage(jsonArrayBuffer);
    console.log('✅ Parsed JSON from ArrayBuffer:', parsed2);
  } catch (error) {
    console.log('❌ Failed to parse JSON from ArrayBuffer:', error.message);
  }

  // Test 3: Binary protocol Type 0x01 (JSON payload)
  console.log('\nTest 3: Binary protocol Type 0x01 (JSON payload)');
  try {
    const binaryMessage1 = createBinaryMessage(0x01, jsonMessage);
    const parsed3 = await parseBinaryMessage(binaryMessage1);
    console.log('✅ Parsed binary protocol 0x01:', parsed3);
  } catch (error) {
    console.log('❌ Failed to parse binary protocol 0x01:', error.message);
  }

  // Test 4: Binary protocol Type 0x02 (Binary + metadata)
  console.log('\nTest 4: Binary protocol Type 0x02 (Binary data with metadata)');
  try {
    const binaryData = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
    const payload = {
      metadata: { event: 'binary-data', channel: 'test' },
      binaryData: binaryData
    };
    const binaryMessage2 = createBinaryMessage(0x02, payload);
    const parsed4 = await parseBinaryMessage(binaryMessage2);
    console.log('✅ Parsed binary protocol 0x02:', parsed4);
    console.log('   Binary data length:', parsed4.binaryData?.length);
  } catch (error) {
    console.log('❌ Failed to parse binary protocol 0x02:', error.message);
  }

  // Test 5: Malformed JSON in binary
  console.log('\nTest 5: Malformed JSON in binary format');
  const malformedJson = '{ "event": "test", "data": invalid }';
  const malformedBlob = new Blob([malformedJson]);
  
  try {
    const parsed5 = await parseBinaryMessage(malformedBlob);
    console.log('✅ Unexpectedly parsed malformed JSON:', parsed5);
  } catch (error) {
    console.log('✅ Correctly failed to parse malformed JSON:', error.message);
  }

  // Test 6: Empty binary data
  console.log('\nTest 6: Empty binary data');
  const emptyBlob = new Blob([]);
  
  try {
    const parsed6 = await parseBinaryMessage(emptyBlob);
    console.log('✅ Unexpectedly parsed empty data:', parsed6);
  } catch (error) {
    console.log('✅ Correctly failed to parse empty data:', error.message);
  }

  console.log('\n=== Binary Parsing Tests Complete ===');
}

// Run tests
testBinaryParsing().catch(console.error);