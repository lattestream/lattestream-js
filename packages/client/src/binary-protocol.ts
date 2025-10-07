/**
 * Binary protocol utilities for LatteStream messages
 */

export interface BinaryMessage {
  messageType: number;
  payload: Uint8Array;
  data?: any;
  binaryData?: Uint8Array;
}

/**
 * Parse a binary message from LatteStream server
 */
export async function parseBinaryMessage(data: ArrayBuffer | Uint8Array | Blob): Promise<any> {
  let bytes: Uint8Array;

  // Handle different binary data types
  if (data instanceof Blob) {
    // Convert Blob to ArrayBuffer first
    const arrayBuffer = await data.arrayBuffer();
    bytes = new Uint8Array(arrayBuffer);
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else {
    bytes = data;
  }

  try {
    // Try to decode as UTF-8 text first (in case it's JSON in binary format)
    const textDecoder = new TextDecoder('utf-8');
    const text = textDecoder.decode(bytes);

    // If it looks like JSON, try to parse it
    const trimmedText = text.trim();
    if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
      try {
        const parsedJson = JSON.parse(trimmedText);
        console.log('Successfully parsed binary data as JSON:', parsedJson);
        return parsedJson;
      } catch (jsonError) {
        console.log('Binary data looks like JSON but failed to parse:', jsonError);
        console.log('Text content:', trimmedText.substring(0, 200) + '...');
      }
    }

    if (bytes.length >= 8) {
      const messageType = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
      const payloadLength = new DataView(bytes.buffer, bytes.byteOffset + 4, 4).getUint32(0, true);

      if (messageType >= 0x01 && messageType <= 0x03 && payloadLength <= bytes.length - 8 && payloadLength > 0) {
        console.log('Binary data appears to be LatteStream binary protocol, parsing...');
        return parseLatteStreamBinaryProtocol(bytes);
      }
    }

    // Assume it's JSON
    if (trimmedText.length > 0) {
      try {
        return JSON.parse(trimmedText);
      } catch (finalJsonError) {
        console.log('Final JSON parse attempt failed:', finalJsonError);
        throw new Error(
          `Unable to parse binary message as JSON or binary protocol. Text: ${trimmedText.substring(0, 100)}...`
        );
      }
    }

    throw new Error('Binary message appears to be empty or invalid UTF-8');
  } catch (error: any) {
    console.log('Failed to parse binary message, trying binary protocol as last resort:', error);
    try {
      return parseLatteStreamBinaryProtocol(bytes);
    } catch (binaryError: any) {
      console.log('Binary protocol parsing also failed:', binaryError);
      throw new Error(`Unable to parse binary message: ${error.message}`);
    }
  }
}

/**
 * Parse LatteStream binary protocol message
 */
export function parseLatteStreamBinaryProtocol(bytes: Uint8Array): any {
  if (bytes.length < 8) {
    throw new Error(`Binary message too short: ${bytes.length} bytes (minimum 8 required)`);
  }

  // LatteStream binary protocol structure:
  // [4 bytes: message type] [4 bytes: payload length] [payload]
  const messageType = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
  const payloadLength = new DataView(bytes.buffer, bytes.byteOffset + 4, 4).getUint32(0, true);

  console.log(
    `Binary protocol: messageType=0x${messageType
      .toString(16)
      .padStart(2, '0')}, payloadLength=${payloadLength}, totalBytes=${bytes.length}`
  );

  if (bytes.length < 8 + payloadLength) {
    throw new Error(`Binary message payload truncated: expected ${8 + payloadLength} bytes, got ${bytes.length}`);
  }

  if (payloadLength === 0) {
    throw new Error('Binary message has zero payload length');
  }

  const payloadBytes = bytes.slice(8, 8 + payloadLength);

  try {
    switch (messageType) {
      case 0x01: // JSON payload
        console.log('Parsing binary protocol type 0x01 (JSON payload)');
        const textDecoder = new TextDecoder('utf-8');
        const jsonText = textDecoder.decode(payloadBytes);
        console.log('JSON text from binary payload:', jsonText.substring(0, 200) + '...');
        return JSON.parse(jsonText);

      case 0x02: // Binary payload with embedded JSON
        console.log('Parsing binary protocol type 0x02 (binary payload with metadata)');
        return parseBinaryPayloadWithMetadata(payloadBytes);

      case 0x03: // Compressed JSON payload
        console.log('Parsing binary protocol type 0x03 (compressed payload)');
        return parseCompressedPayload(payloadBytes);

      default:
        console.log('Unknown binary message type:', `0x${messageType.toString(16)}`);
        // Fallback: try to decode entire payload as UTF-8
        const fallbackDecoder = new TextDecoder('utf-8');
        const fallbackText = fallbackDecoder.decode(payloadBytes);
        console.log('Fallback parsing as JSON:', fallbackText.substring(0, 200) + '...');

        if (fallbackText.trim().length === 0) {
          throw new Error(`Unknown message type 0x${messageType.toString(16)} with empty payload`);
        }

        return JSON.parse(fallbackText);
    }
  } catch (error: any) {
    console.log(`Error parsing binary protocol message type 0x${messageType.toString(16)}:`, error);
    throw new Error(`Failed to parse binary protocol message type 0x${messageType.toString(16)}: ${error.message}`);
  }
}

/**
 * Parse binary payload with embedded JSON metadata
 */
function parseBinaryPayloadWithMetadata(payloadBytes: Uint8Array): any {
  if (payloadBytes.length < 4) {
    throw new Error(`Binary payload with metadata too short: ${payloadBytes.length} bytes (minimum 4 required)`);
  }

  // Extract JSON metadata and binary data
  const metadataLength = new DataView(payloadBytes.buffer, payloadBytes.byteOffset, 4).getUint32(0, true);
  console.log(`Binary payload metadata length: ${metadataLength}`);

  if (payloadBytes.length < 4 + metadataLength) {
    throw new Error(
      `Binary payload metadata truncated: expected ${4 + metadataLength} bytes, got ${payloadBytes.length}`
    );
  }

  if (metadataLength === 0) {
    throw new Error('Binary payload has zero metadata length');
  }

  const metadataBytes = payloadBytes.slice(4, 4 + metadataLength);
  const binaryDataBytes = payloadBytes.slice(4 + metadataLength);

  console.log(`Binary payload: metadataBytes=${metadataBytes.length}, binaryDataBytes=${binaryDataBytes.length}`);

  try {
    const metadataDecoder = new TextDecoder('utf-8');
    const metadataText = metadataDecoder.decode(metadataBytes);
    console.log('Metadata JSON text:', metadataText.substring(0, 200) + '...');

    const metadata = JSON.parse(metadataText);

    return {
      ...metadata,
      binaryData: binaryDataBytes,
    };
  } catch (error: any) {
    console.log('Failed to parse binary payload metadata as JSON:', error);
    throw new Error(`Failed to parse binary payload metadata: ${error.message}`);
  }
}

/**
 * Parse compressed payload (placeholder for future implementation)
 */
function parseCompressedPayload(payloadBytes: Uint8Array): any {
  // TODO: Implement compression support (e.g., gzip, deflate)
  // For now, treat as regular UTF-8 JSON
  const textDecoder = new TextDecoder('utf-8');
  const jsonText = textDecoder.decode(payloadBytes);
  return JSON.parse(jsonText);
}

/**
 * Create a binary message for sending (if needed for future client->server binary messages)
 */
export function createBinaryMessage(messageType: number, payload: any): Uint8Array {
  let payloadBytes: Uint8Array;

  switch (messageType) {
    case 0x01: // JSON payload
      const jsonString = JSON.stringify(payload);
      payloadBytes = new TextEncoder().encode(jsonString);
      break;

    case 0x02: // Binary payload with metadata
      if (!payload.binaryData || !payload.metadata) {
        throw new Error('Binary payload requires both metadata and binaryData properties');
      }
      const metadataString = JSON.stringify(payload.metadata);
      const metadataBytes = new TextEncoder().encode(metadataString);
      const metadataLengthBytes = new Uint8Array(4);
      new DataView(metadataLengthBytes.buffer).setUint32(0, metadataBytes.length, true);

      payloadBytes = new Uint8Array(4 + metadataBytes.length + payload.binaryData.length);
      payloadBytes.set(metadataLengthBytes, 0);
      payloadBytes.set(metadataBytes, 4);
      payloadBytes.set(payload.binaryData, 4 + metadataBytes.length);
      break;

    default:
      throw new Error(`Unsupported message type: ${messageType}`);
  }

  // Create final message with header
  const message = new Uint8Array(8 + payloadBytes.length);
  const messageTypeBytes = new Uint8Array(4);
  const payloadLengthBytes = new Uint8Array(4);

  new DataView(messageTypeBytes.buffer).setUint32(0, messageType, true);
  new DataView(payloadLengthBytes.buffer).setUint32(0, payloadBytes.length, true);

  message.set(messageTypeBytes, 0);
  message.set(payloadLengthBytes, 4);
  message.set(payloadBytes, 8);

  return message;
}

/**
 * Check if data is binary format
 */
export function isBinaryMessage(data: any): boolean {
  return data instanceof ArrayBuffer || data instanceof Uint8Array || data instanceof Blob;
}

/**
 * Get message type from binary data
 */
export async function getBinaryMessageType(data: ArrayBuffer | Uint8Array | Blob): Promise<number | null> {
  let bytes: Uint8Array;

  if (data instanceof Blob) {
    const arrayBuffer = await data.arrayBuffer();
    bytes = new Uint8Array(arrayBuffer);
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else {
    bytes = data;
  }

  if (bytes.length < 4) {
    return null;
  }

  return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
}
