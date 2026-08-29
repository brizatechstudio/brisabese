import { CacheStats } from './types';
type Entry = { value: unknown; expiresAt: number; };

export class CacheManager {
  private entries = new Map<string, Entry>();
  private hits = new Map<string, number>();
  private misses = new Map<string, number>();
  constructor(private provider: 'memory' | 'redis' = 'memory') {}
  private key(namespace: string, key: string): string { return `${namespace}:${key}`; }
  public get<T>(namespace: string, key: string): T | undefined { const value = this.entries.get(this.key(namespace, key)); if (!value || value.expiresAt < Date.now()) { if (value) this.entries.delete(this.key(namespace, key)); this.misses.set(namespace, (this.misses.get(namespace) || 0) + 1); return undefined; } this.hits.set(namespace, (this.hits.get(namespace) || 0) + 1); return structuredClone(value.value) as T; }
  public set<T>(namespace: string, key: string, value: T, ttlMs = 30_000): void { if (!namespace || !key || ttlMs < 1) throw new Error('A cache namespace, key, and positive TTL are required.'); this.entries.set(this.key(namespace, key), { value: structuredClone(value), expiresAt: Date.now() + ttlMs }); }
  public invalidate(namespace: string, key?: string): number { let removed = 0; for (const item of Array.from(this.entries.keys())) if (item === this.key(namespace, key || '') || (!key && item.startsWith(`${namespace}:`))) { this.entries.delete(item); removed += 1; } return removed; }
  public stats(namespace?: string): CacheStats[] { const namespaces = namespace ? [namespace] : Array.from(new Set([...Array.from(this.entries.keys()).map((key) => key.split(':')[0]), ...Array.from(this.hits.keys()), ...Array.from(this.misses.keys())])); return namespaces.map((name) => { const hits = this.hits.get(name) || 0; const misses = this.misses.get(name) || 0; return { namespace: name, entries: Array.from(this.entries.keys()).filter((key) => key.startsWith(`${name}:`)).length, hits, misses, hitRate: hits + misses ? Number((hits / (hits + misses) * 100).toFixed(2)) : 0, provider: this.provider }; }); }
}
