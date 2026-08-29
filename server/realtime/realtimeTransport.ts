import { logger } from '../logger';
import { redisClient } from '../redis';
import { RealtimeCdcEvent } from './types';

/**
 * RealtimeTransport provides an abstraction for cross-instance event delivery.
 * In single-instance mode, it's a no-op passthrough.
 * In multi-instance mode, it uses Redis Pub/Sub to broadcast events to all instances.
 */
export class RealtimeTransport {
  private initialized = false;
  private redisAvailable = false;

  public async init(onRemoteEvent: (event: RealtimeCdcEvent) => Promise<void>): Promise<void> {
    this.initialized = true;
    const redisHealth = await redisClient.healthCheck();
    this.redisAvailable = redisHealth.connected;
    if (this.redisAvailable) {
      await redisClient.subscribe('brisabase:realtime:events', (value) => {
        void onRemoteEvent(value as RealtimeCdcEvent);
      });
      logger.info('RealtimeTransport initialized with Redis Pub/Sub (multi-instance ready)');
    } else {
      logger.warn('RealtimeTransport could not initialize Redis Pub/Sub.');
    }
  }

  public async publish(event: RealtimeCdcEvent): Promise<void> {
    if (!this.initialized) return;
    if (!this.redisAvailable) return; // Single instance: no cross-instance delivery needed

    try {
      await redisClient.publish('brisabase:realtime:events', event);
    } catch (err) {
      logger.error('Erro ao publicar evento no Redis transport:', err);
    }
  }

  public async close(): Promise<void> {
    this.initialized = false;
  }
}
