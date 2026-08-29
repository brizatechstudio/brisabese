import { createClient, RedisClientType } from 'redis';
import { config } from './config';

class RedisRuntime {
  private client: RedisClientType | null = null;
  private subscriber: RedisClientType | null = null;
  /** Test-only fixture state. Runtime must have a Redis connection. */
  private readonly testCache = new Map<string, { value: string; expiresAt?: number }>();

  private key(value: string): string { return `${config.redis.prefix}:${value}`; }

  public async connect(): Promise<void> {
    if (this.client?.isOpen) return;
    if (config.testMode && !config.redisUrl) return;
    if (!config.redisUrl) throw new Error('[BRISABASE REDIS ERROR] REDIS_URL is required.');
    const client = createClient({ url: config.redisUrl, ...(config.redis.tls ? { socket: { tls: true } } : {}) });
    client.on('error', () => undefined);
    await client.connect();
    await client.ping();
    this.client = client;
  }

  private requireClient(): RedisClientType {
    if (!this.client?.isOpen) throw new Error('[BRISABASE REDIS ERROR] Redis is unavailable.');
    return this.client;
  }

  public async get<T>(key: string): Promise<T | null> {
    if (config.testMode && !this.client) {
      const prefixed = this.key(key); const item = this.testCache.get(prefixed);
      if (!item || (item.expiresAt && item.expiresAt < Date.now())) { this.testCache.delete(prefixed); return null; }
      return JSON.parse(item.value) as T;
    }
    const value = await this.requireClient().get(this.key(key));
    return value === null ? null : JSON.parse(String(value)) as T;
  }

  public async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const payload = JSON.stringify(value);
    const prefixed = this.key(key);
    if (config.testMode && !this.client) { this.testCache.set(prefixed, { value: payload, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined }); return; }
    if (ttlSeconds) await this.requireClient().set(prefixed, payload, { EX: ttlSeconds });
    else await this.requireClient().set(prefixed, payload);
  }

  public async del(key: string): Promise<void> {
    const prefixed = this.key(key);
    if (config.testMode && !this.client) { this.testCache.delete(prefixed); return; }
    await this.requireClient().del(prefixed);
  }

  public async publish(channel: string, value: unknown): Promise<void> {
    const prefixed = this.key(channel);
    if (config.testMode && !this.client) { this.testCache.set(`pub:${prefixed}`, { value: JSON.stringify(value) }); return; }
    await this.requireClient().publish(prefixed, JSON.stringify(value));
  }

  public async subscribe(channel: string, listener: (value: unknown) => void): Promise<void> {
    if (config.testMode && !this.client) return;
    if (!this.subscriber) {
      const client = this.requireClient().duplicate();
      client.on('error', () => undefined);
      await client.connect();
      this.subscriber = client;
    }
    await this.subscriber.subscribe(this.key(channel), (message) => {
      try { listener(JSON.parse(message)); } catch { /* invalid cross-process payloads are ignored */ }
    });
  }

  public async increment(key: string, ttlSeconds: number): Promise<number> {
    if (config.testMode && !this.client) {
      const current = await this.get<number>(key) || 0;
      await this.set(key, current + 1, ttlSeconds);
      return current + 1;
    }
    const client = this.requireClient();
    const prefixed = this.key(key); const value = await client.incr(prefixed);
    if (value === 1) await client.expire(prefixed, ttlSeconds);
    return value;
  }

  public async healthCheck(): Promise<{ status: 'ok' | 'degraded'; connected: boolean }> {
    if (config.testMode && !this.client) return { status: 'ok', connected: false };
    try {
      await this.requireClient().ping();
      return { status: 'ok', connected: true };
    } catch {
      return { status: 'degraded', connected: false };
    }
  }

  public async close(): Promise<void> {
    if (this.subscriber?.isOpen) await this.subscriber.quit();
    this.subscriber = null;
    if (this.client?.isOpen) await this.client.quit();
    this.client = null;
  }
}

export const redisClient = new RedisRuntime();
