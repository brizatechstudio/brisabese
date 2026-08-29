import crypto from 'node:crypto';
import type { RuntimeHost } from './functionRuntime';

interface Entry {
  tokenHash: Buffer;
  host: RuntimeHost;
  expiresAt: number;
  used: number;
}

function digest(value: string): Buffer {
  return crypto.createHash('sha256').update(value).digest();
}

export class RuntimeRpcRegistry {
  private readonly entries = new Map<string, Entry>();

  public register(host: RuntimeHost, ttlMs: number): { sessionId: string; token: string } {
    this.sweep();
    const sessionId = `frpc_${crypto.randomUUID().replace(/-/g, '')}`;
    const token = crypto.randomBytes(32).toString('base64url');
    this.entries.set(sessionId, {
      tokenHash: digest(token),
      host,
      expiresAt: Date.now() + Math.min(Math.max(ttlMs, 1_000), 120_000),
      used: 0,
    });
    return { sessionId, token };
  }

  public async invoke(sessionId: string, token: string, action: string, args: unknown): Promise<unknown> {
    const entry = this.entries.get(sessionId);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.entries.delete(sessionId);
      throw Object.assign(new Error('Function RPC session is invalid or expired.'), { code: 'FUNCTION_RPC_EXPIRED' });
    }
    const received = digest(token || '');
    if (received.length !== entry.tokenHash.length || !crypto.timingSafeEqual(received, entry.tokenHash)) {
      throw Object.assign(new Error('Function RPC capability is invalid.'), { code: 'FUNCTION_RPC_FORBIDDEN' });
    }
    entry.used += 1;
    if (entry.used > 500) {
      this.entries.delete(sessionId);
      throw Object.assign(new Error('Function RPC call limit exceeded.'), { code: 'FUNCTION_RPC_LIMIT' });
    }
    return entry.host.handleRpc(action, args);
  }

  public release(sessionId: string): void {
    this.entries.delete(sessionId);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key);
  }
}

export const runtimeRpcRegistry = new RuntimeRpcRegistry();
