export class ConnectionPool {
  private pool = new Map<
    string,
    {
      controller: AbortController;
      lastUsed: number;
      inUse: boolean;
    }
  >();
  private readonly maxSize: number;
  private readonly maxAge: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(maxSize = 20, maxAge = 300_000) {
    this.maxSize = maxSize;
    this.maxAge = maxAge;
    this.startCleanup();
  }

  acquire(key: string): AbortController {
    const existing = this.pool.get(key);

    if (existing && !existing.inUse && Date.now() - existing.lastUsed < this.maxAge) {
      existing.inUse = true;
      existing.lastUsed = Date.now();
      return existing.controller;
    }

    if (existing) {
      existing.controller.abort();
      this.pool.delete(key);
    }

    const controller = new AbortController();
    this.pool.set(key, {
      controller,
      lastUsed: Date.now(),
      inUse: true,
    });

    if (this.pool.size > this.maxSize) {
      this.evictOldest();
    }

    return controller;
  }

  release(key: string): void {
    const entry = this.pool.get(key);
    if (entry) {
      entry.inUse = false;
      entry.lastUsed = Date.now();
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.pool.entries()) {
      if (!entry.inUse && entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.pool.get(oldestKey)!;
      entry.controller.abort();
      this.pool.delete(oldestKey);
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.pool.entries()) {
        if (!entry.inUse && now - entry.lastUsed > this.maxAge) {
          entry.controller.abort();
          this.pool.delete(key);
        }
      }
    }, 60000); // Cleanup every minute
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    for (const entry of this.pool.values()) {
      entry.controller.abort();
    }

    this.pool.clear();
  }
}

export class BatchProcessor<T> {
  private batch: T[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly batchSize: number;
  private readonly flushInterval: number;

  constructor(private processor: (items: T[]) => Promise<void>, batchSize = 50, flushInterval = 100) {
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
  }

  add(item: T): void {
    this.batch.push(item);

    if (this.batch.length >= this.batchSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.batch.length === 0) return;

    const items = this.batch.splice(0);

    try {
      await this.processor(items);
    } catch (error) {
      console.error('Batch processing error:', error);
    }
  }

  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.batch.length = 0;
  }
}

export class RequestCache<T> {
  private cache = new Map<
    string,
    {
      data: T;
      timestamp: number;
      promise?: Promise<T>;
    }
  >();
  private readonly ttl: number;

  constructor(ttl = 30000) {
    // 30 seconds
    this.ttl = ttl;
  }

  async get(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);

    if (cached) {
      if (Date.now() - cached.timestamp < this.ttl) {
        return cached.data;
      }

      if (cached.promise) {
        return cached.promise;
      }
    }

    const promise = fetcher();

    this.cache.set(key, {
      data: cached?.data as T,
      timestamp: cached?.timestamp || 0,
      promise,
    });

    try {
      const data = await promise;
      this.cache.set(key, {
        data,
        timestamp: Date.now(),
      });
      return data;
    } catch (error) {
      this.cache.delete(key);
      throw error;
    }
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: string): void {
    this.cache.delete(key);
  }
}

export function createRetryWrapper<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  maxRetries = 3,
  baseDelay = 1000
): T {
  return (async (...args: Parameters<T>) => {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          throw lastError;
        }

        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }) as T;
}

export class MemoryMonitor {
  private samples: number[] = [];
  private timer: NodeJS.Timeout | null = null;

  start(interval = 10000): void {
    // 10 seconds
    this.timer = setInterval(() => {
      if (process && process.memoryUsage) {
        const usage = process.memoryUsage();
        this.samples.push(usage.heapUsed);

        if (this.samples.length > 100) {
          this.samples.shift();
        }
      }
    }, interval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getStats(): { current: number; average: number; peak: number } | null {
    if (this.samples.length === 0) return null;

    const current = this.samples[this.samples.length - 1];
    const average = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    const peak = Math.max(...this.samples);

    return { current, average, peak };
  }
}
