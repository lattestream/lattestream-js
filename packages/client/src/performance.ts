export class MessageQueue {
  private queue: any[] = [];
  private flushTimer: number | null = null;
  private readonly batchSize: number;
  private readonly flushInterval: number;

  constructor(
    private sender: (messages: any | any[]) => boolean,
    batchSize = 10,
    flushInterval = 16 // ~60fps
  ) {
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
  }

  enqueue(message: any): void {
    this.queue.push(message);

    if (this.queue.length >= this.batchSize) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = window.setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.queue.length === 0) return;

    const messages = this.queue.splice(0);

    if (messages.length === 1) {
      this.sender(messages[0]);
    } else {
      this.sender({
        event: 'lattestream:batch',
        data: { messages },
      });
    }
  }

  clear(): void {
    this.queue.length = 0;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;

  constructor(factory: () => T, reset: (obj: T) => void, initialSize = 10) {
    this.factory = factory;
    this.reset = reset;

    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  acquire(): T {
    const obj = this.pool.pop();
    return obj || this.factory();
  }

  release(obj: T): void {
    this.reset(obj);
    if (this.pool.length < 50) {
      // Cap pool size
      this.pool.push(obj);
    }
  }
}

export class FastEventEmitter {
  private events = new Map<string, Set<Function>>();
  private onceEvents = new Map<string, Set<Function>>();

  on(event: string, listener: Function): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(listener);
  }

  once(event: string, listener: Function): void {
    if (!this.onceEvents.has(event)) {
      this.onceEvents.set(event, new Set());
    }
    this.onceEvents.get(event)!.add(listener);
  }

  off(event: string, listener?: Function): void {
    if (!listener) {
      this.events.delete(event);
      this.onceEvents.delete(event);
      return;
    }

    this.events.get(event)?.delete(listener);
    this.onceEvents.get(event)?.delete(listener);
  }

  emit(event: string, ...args: any[]): void {
    const listeners = this.events.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(...args);
        } catch (error) {
          console.error('Error in event listener:', error);
        }
      }
    }

    const onceListeners = this.onceEvents.get(event);
    if (onceListeners) {
      for (const listener of onceListeners) {
        try {
          listener(...args);
        } catch (error) {
          console.error('Error in once event listener:', error);
        }
      }
      this.onceEvents.delete(event);
    }
  }

  clear(): void {
    this.events.clear();
    this.onceEvents.clear();
  }
}

export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: number | null = null;

  return (...args: Parameters<T>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }

    timeout = window.setTimeout(() => {
      timeout = null;
      func(...args);
    }, wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(func: T, limit: number): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export class PerformanceMonitor {
  private metrics = new Map<string, number[]>();
  private readonly maxSamples = 100;

  startTiming(label: string): () => void {
    const start = performance.now();

    return () => {
      const duration = performance.now() - start;
      this.addMetric(label, duration);
    };
  }

  addMetric(label: string, value: number): void {
    if (!this.metrics.has(label)) {
      this.metrics.set(label, []);
    }

    const samples = this.metrics.get(label)!;
    samples.push(value);

    if (samples.length > this.maxSamples) {
      samples.shift();
    }
  }

  getStats(label: string): { avg: number; min: number; max: number; count: number } | null {
    const samples = this.metrics.get(label);
    if (!samples || samples.length === 0) return null;

    const sum = samples.reduce((a, b) => a + b, 0);
    return {
      avg: sum / samples.length,
      min: Math.min(...samples),
      max: Math.max(...samples),
      count: samples.length,
    };
  }

  clear(): void {
    this.metrics.clear();
  }
}
