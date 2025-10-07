import { createHmac, createHash, randomBytes } from 'crypto';

export class EncryptionHelper {
  constructor(private masterKey: string) {
    if (!masterKey) {
      throw new Error('Master key is required for encryption');
    }
  }

  generateAuthString(socketId: string, channelName: string, channelData?: string): string {
    const stringToSign = `${socketId}:${channelName}`;
    const finalString = channelData ? `${stringToSign}:${channelData}` : stringToSign;

    const hmac = createHmac('sha256', this.masterKey);
    hmac.update(finalString);
    const signature = hmac.digest('hex');

    return `${socketId}:${signature}`;
  }

  verifyAuthString(authString: string, channelName: string, channelData?: string): boolean {
    try {
      const [socketId, signature] = authString.split(':');
      if (!socketId || !signature) {
        return false;
      }

      const expectedAuth = this.generateAuthString(socketId, channelName, channelData);
      const [, expectedSignature] = expectedAuth.split(':');

      return this.constantTimeCompare(signature, expectedSignature);
    } catch (error) {
      return false;
    }
  }

  generateWebhookSignature(payload: string): string {
    const hmac = createHmac('sha256', this.masterKey);
    hmac.update(payload);
    return hmac.digest('hex');
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const expectedSignature = this.generateWebhookSignature(payload);
    return this.constantTimeCompare(signature, expectedSignature);
  }

  generateSocketId(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(8).toString('hex');
    return `${timestamp}.${random}`;
  }

  hashChannelData(data: any): string {
    const json = JSON.stringify(data);
    return createHash('sha256').update(json).digest('hex');
  }

  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }
}

export function createAuthHelper(masterKey: string): EncryptionHelper {
  return new EncryptionHelper(masterKey);
}
