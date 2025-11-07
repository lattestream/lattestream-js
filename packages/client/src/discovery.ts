import { DiscoveryResponse } from './types';

export interface DiscoveryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  backoffMultiplier?: number;
  enableJitter?: boolean;
  enableLogging?: boolean;
}

export class DiscoveryService {
  private attempts = 0;

  constructor(private options: DiscoveryOptions = {}) {}

  async discover(apiKey: string, endpoint: string): Promise<DiscoveryResponse> {
    const maxAttempts = this.options.maxAttempts || 3;
    const baseDelay = this.options.baseDelay || 1000;
    const backoffMultiplier = this.options.backoffMultiplier || 2;
    const enableJitter = this.options.enableJitter !== false;

    this.attempts = 0;

    while (this.attempts < maxAttempts) {
      try {
        this.log(`Discovery attempt ${this.attempts + 1}/${maxAttempts}`);

        const protocol = endpoint.includes('localhost') ? 'http' : 'https';
        const url = `${protocol}://${endpoint}/discover?api_key=${apiKey}`;

        this.log(`Fetching discovery from: ${url}`);

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Discovery request failed with status: ${response.status}`);
        }

        const data: DiscoveryResponse = await response.json();

        this.log('Discovery successful:', data);

        if (!data.discovery_token) {
          throw new Error('Discovery response missing discovery_token');
        }

        return data;
      } catch (error) {
        this.attempts++;

        if (this.attempts >= maxAttempts) {
          this.log(`Discovery failed after ${maxAttempts} attempts`);
          throw new Error(`Discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Calculate delay with exponential backoff
        const exponentialDelay = Math.pow(backoffMultiplier, this.attempts - 1) * baseDelay;
        let delay = exponentialDelay;

        if (enableJitter) {
          const jitterRange = delay * 0.25;
          const jitter = Math.random() * jitterRange;
          delay = delay + jitter;
        }

        this.log(`Discovery attempt failed, retrying in ${Math.round(delay)}ms`, error);
        await this.sleep(delay);
      }
    }

    throw new Error('Discovery failed: Max attempts reached');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private log(...args: any[]): void {
    if (this.options.enableLogging) {
      console.log('[LatteStream Discovery]', ...args);
    }
  }
}
