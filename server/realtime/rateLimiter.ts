import { logger } from '../logger';
import { redisClient } from '../redis';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class RealtimeRateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private windowMs = 60 * 1000; // 1 minute window

  // Default limits
  private maxConnectionsPerIp = 50;
  private maxSubscriptionsPerConnection = 20;
  private maxBroadcastsPerSecond = 1000;
  private maxMessagesPerSecond = 1000;
  private maxMessageSizeBytes = 64 * 1024; // 64 KB

  public check(key: string, limit: number, windowMs: number = this.windowMs): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const entry = this.store.get(key) || { count: 0, resetTime: now + windowMs };

    if (now > entry.resetTime) {
      entry.count = 1;
      entry.resetTime = now + windowMs;
    } else {
      entry.count += 1;
    }

    this.store.set(key, entry);

    if (entry.count > limit) {
      const retryAfterSeconds = Math.ceil((entry.resetTime - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    return { allowed: true };
  }

  public checkConnection(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
    return this.check(`conn:${ip}`, this.maxConnectionsPerIp);
  }

  public checkSubscription(connectionId: string, currentCount: number): { allowed: boolean; reason?: string } {
    if (currentCount >= this.maxSubscriptionsPerConnection) {
      return { allowed: false, reason: `Limite de ${this.maxSubscriptionsPerConnection} inscrições por conexão excedido.` };
    }
    return { allowed: true };
  }

  public checkBroadcast(projectId: string, environmentId: string): { allowed: boolean; retryAfterSeconds?: number } {
    return this.check(`broadcast:${projectId}:${environmentId}`, this.maxBroadcastsPerSecond, 1000);
  }

  public checkMessage(projectId: string, environmentId: string): { allowed: boolean; retryAfterSeconds?: number } {
    return this.check(`msg:${projectId}:${environmentId}`, this.maxMessagesPerSecond, 1000);
  }


  public async checkMessageDistributed(projectId: string, environmentId: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
    try {
      const count = await redisClient.increment(`rate:realtime:message:${projectId}:${environmentId}`, 1);
      return count <= this.maxMessagesPerSecond ? { allowed: true } : { allowed: false, retryAfterSeconds: 1 };
    } catch (error) {
      logger.error('Distributed realtime message rate limit unavailable:', error);
      return { allowed: false, retryAfterSeconds: 1 };
    }
  }

  public async checkBroadcastDistributed(projectId: string, environmentId: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
    try {
      const count = await redisClient.increment(`rate:realtime:broadcast:${projectId}:${environmentId}`, 1);
      return count <= this.maxBroadcastsPerSecond ? { allowed: true } : { allowed: false, retryAfterSeconds: 1 };
    } catch (error) {
      logger.error('Distributed realtime broadcast rate limit unavailable:', error);
      return { allowed: false, retryAfterSeconds: 1 };
    }
  }

  public checkMessageSize(payload: any): { allowed: boolean; reason?: string } {
    const size = Buffer.byteLength(JSON.stringify(payload || {}), 'utf8');
    if (size > this.maxMessageSizeBytes) {
      return { allowed: false, reason: `Mensagem excede o limite de ${this.maxMessageSizeBytes / 1024} KB.` };
    }
    return { allowed: true };
  }

  public getMaxMessageSizeBytes(): number {
    return this.maxMessageSizeBytes;
  }

  public setLimits(limits: {
    maxConnectionsPerIp?: number;
    maxSubscriptionsPerConnection?: number;
    maxBroadcastsPerSecond?: number;
    maxMessagesPerSecond?: number;
    maxMessageSizeBytes?: number;
  }): void {
    if (limits.maxConnectionsPerIp !== undefined) this.maxConnectionsPerIp = limits.maxConnectionsPerIp;
    if (limits.maxSubscriptionsPerConnection !== undefined) this.maxSubscriptionsPerConnection = limits.maxSubscriptionsPerConnection;
    if (limits.maxBroadcastsPerSecond !== undefined) this.maxBroadcastsPerSecond = limits.maxBroadcastsPerSecond;
    if (limits.maxMessagesPerSecond !== undefined) this.maxMessagesPerSecond = limits.maxMessagesPerSecond;
    if (limits.maxMessageSizeBytes !== undefined) this.maxMessageSizeBytes = limits.maxMessageSizeBytes;
  }
}
