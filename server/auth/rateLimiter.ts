import { logger } from '../logger';

interface RateLimitEntry {
  count: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

export class RateLimiter {
  private attempts = new Map<string, RateLimitEntry>();

  constructor(
    private maxAttempts = 5,
    private windowMs = 15 * 60 * 1000, // 15 mins
    private lockoutMs = 15 * 60 * 1000  // 15 mins lockout
  ) {}

  check(key: string): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const entry = this.attempts.get(key);

    if (!entry) {
      return { allowed: true };
    }

    if (entry.lockedUntil && entry.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    // Reset window if expired
    if (now - entry.firstAttemptAt > this.windowMs) {
      this.attempts.delete(key);
      return { allowed: true };
    }

    if (entry.count >= this.maxAttempts) {
      entry.lockedUntil = now + this.lockoutMs;
      logger.warn(`[RateLimiter] Chave ${key} bloqueada temporariamente por exceder limite de tentativas.`);
      const retryAfterSeconds = Math.ceil(this.lockoutMs / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    return { allowed: true };
  }

  recordFailure(key: string): void {
    const now = Date.now();
    const entry = this.attempts.get(key);

    if (!entry || now - entry.firstAttemptAt > this.windowMs) {
      this.attempts.set(key, { count: 1, firstAttemptAt: now });
    } else {
      entry.count += 1;
      if (entry.count >= this.maxAttempts) {
        entry.lockedUntil = now + this.lockoutMs;
      }
    }
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

export const authRateLimiter = new RateLimiter(5, 15 * 60 * 1000, 15 * 60 * 1000);
export const sensitiveActionRateLimiter = new RateLimiter(3, 10 * 60 * 1000, 10 * 60 * 1000);
