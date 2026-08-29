import { EventEmitter } from 'node:events';
import { logger } from '../logger';
import { db } from '../db/database';
import { redisClient } from '../redis';
import { RealtimeCdcEvent, RealtimeMetrics, RealtimeEventLogItem } from './types';
import { channelManager } from './channelManager';
import { subscriptionManager } from './subscriptionManager';
import { RealtimeConnectionManager } from './connectionManager';
import { RealtimeEventDispatcher } from './eventDispatcher';
import { RealtimePresenceManager } from './presenceManager';
import { RealtimeBroadcastManager } from './broadcastManager';
import { RealtimeRateLimiter } from './rateLimiter';
import { RealtimeMetricsCollector } from './metrics';
import { RealtimeTransport } from './realtimeTransport';
import { RealtimePublicationManager } from './publicationManager';
import { RealtimePermissionEngine } from './authorization';
import { observability } from '../observability';
import { webhookEngine } from '../webhooks/webhookEngine';

export class RealtimeEngine extends EventEmitter {
  private static instance: RealtimeEngine | null = null;
  private started = false;
  private eventLog: RealtimeEventLogItem[] = [];
  private maxEventLogSize = 500;
  private transport: RealtimeTransport | null = null;
  private cdcAvailable = false;
  private readonly recentEventIds = new Map<string, number>();

  public readonly connectionManager: RealtimeConnectionManager;
  public readonly dispatcher: RealtimeEventDispatcher;
  public readonly presenceManager: RealtimePresenceManager;
  public readonly broadcastManager: RealtimeBroadcastManager;
  public readonly rateLimiter: RealtimeRateLimiter;
  public readonly metrics: RealtimeMetricsCollector;
  public readonly publicationManager: RealtimePublicationManager;

  private constructor() {
    super();
    this.connectionManager = new RealtimeConnectionManager();
    this.dispatcher = new RealtimeEventDispatcher();
    this.presenceManager = new RealtimePresenceManager();
    this.broadcastManager = new RealtimeBroadcastManager();
    this.rateLimiter = new RealtimeRateLimiter();
    this.metrics = new RealtimeMetricsCollector();
    this.publicationManager = new RealtimePublicationManager();
    this.connectionManager.setLifecycleHooks({
      onDisconnect: (connection, reason) => {
        this.presenceManager.removeConnectionFromAllChannels(connection.id);
        this.metrics.recordDisconnect();
        if (connection.projectId && connection.environmentId && connection.organizationId) {
          this.logAudit('realtime.disconnected', {
            organizationId: connection.organizationId,
            projectId: connection.projectId,
            environmentId: connection.environmentId,
            userId: connection.userId,
            metadata: { connectionId: connection.id, reason },
          });
        }
      },
      onMessageSent: () => this.metrics.recordMessage(),
    });
  }

  public static getInstance(): RealtimeEngine {
    if (!RealtimeEngine.instance) {
      RealtimeEngine.instance = new RealtimeEngine();
    }
    return RealtimeEngine.instance;
  }

  public async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    // Initialize Redis transport for multi-instance support
    this.transport = new RealtimeTransport();
    await this.transport.init(async (event) => this.ingestRemoteEvent(event));

    // Wire up dispatcher to connection manager
    this.dispatcher.setConnectionManager(this.connectionManager);

    // Wire up broadcast manager
    this.broadcastManager.setConnectionManager(this.connectionManager);

    // Wire up presence manager
    this.presenceManager.setConnectionManager(this.connectionManager);

    // Start metrics collection interval
    this.metrics.start();

    // Start heartbeat interval
    this.connectionManager.startHeartbeat();

    logger.info('🚀 Realtime Engine started (WebSocket + CDC + Channels + Broadcast + Presence)');
  }

  public async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;

    this.metrics.stop();
    this.connectionManager.stopHeartbeat();
    this.connectionManager.disconnectAll('server_shutdown');
    if (this.transport) {
      await this.transport.close();
    }
    logger.info('🛑 Realtime Engine stopped gracefully');
  }

  /**
   * Ingest a CDC event from any source (PostgreSQL WAL, logical replication,
   * database engine mutations, REST API mutations, SQL editor, etc.)
   */
  public async ingestCdcEvent(event: RealtimeCdcEvent): Promise<void> {
    if (this.recentEventIds.has(event.eventId)) return;
    this.rememberEvent(event.eventId);
    const startTime = performance.now();
    const traceSpan = observability.traces.startSpan('realtime.cdc_dispatch', 'realtime', { operation: event.operation, table: event.table }, { organizationId: event.organizationId, projectId: event.projectId, environmentId: event.environmentId, requestId: event.requestId, service: 'realtime' });

    // 1. Record metrics
    this.metrics.recordEvent();
    observability.metric('realtime.events', 1, 'counter', { operation: event.operation }, { organizationId: event.organizationId, projectId: event.projectId, environmentId: event.environmentId, requestId: event.requestId, service: 'realtime' });

    // 2. Dispatch to matching subscriptions
    const dispatched = this.dispatcher.dispatch(event);

    // 3. Record event log for dashboard
    this.recordEventLog(event, dispatched, startTime);

    // 4. Publish to Redis transport for cross-instance delivery
    if (this.transport) {
      await this.transport.publish(event);
    }

    // Webhook delivery is an asynchronous side effect. A temporary webhook
    // storage/database failure must not turn a successfully processed realtime
    // CDC event into an unhandled promise rejection or terminate the runtime.
    void webhookEngine.emit(
      { organizationId: event.organizationId, projectId: event.projectId, environmentId: event.environmentId },
      `database.${event.operation.toLowerCase()}`,
      { schema: event.schema, table: event.table, new: event.new, old: event.old, transactionId: event.transactionId, requestId: event.requestId },
      event.eventId,
    ).catch((error) => {
      logger.warn('Realtime webhook dispatch could not be queued.', {
        eventId: event.eventId,
        projectId: event.projectId,
        environmentId: event.environmentId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    observability.traces.endSpan(traceSpan);
  }

  private recordEventLog(event: RealtimeCdcEvent, dispatchedCount: number, startTime: number): void {
    const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
    this.metrics.recordLatency(latencyMs);
    observability.metric('realtime.latency_ms', latencyMs, 'histogram', {}, { organizationId: event.organizationId, projectId: event.projectId, environmentId: event.environmentId, requestId: event.requestId, service: 'realtime' });
    const logItem: RealtimeEventLogItem = {
      id: `evtlog_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      eventId: event.eventId,
      channel: `${event.schema}.${event.table}`,
      event: event.operation,
      schema: event.schema,
      table: event.table,
      payload: JSON.stringify({
        event: event.operation,
        schema: event.schema,
        table: event.table,
        new: RealtimePermissionEngine.sanitizeRecord(event.new),
        old: RealtimePermissionEngine.sanitizeRecord(event.old),
        eventId: event.eventId,
        transactionId: event.transactionId,
        requestId: event.requestId,
      }),
      timestamp: event.timestamp,
      latencyMs,
      projectId: event.projectId,
      environmentId: event.environmentId,
    };
    this.eventLog.unshift(logItem);
    if (this.eventLog.length > this.maxEventLogSize) {
      this.eventLog.length = this.maxEventLogSize;
    }
  }

  public getEventLog(projectId?: string, environmentId?: string): RealtimeEventLogItem[] {
    let logs = [...this.eventLog];
    if (projectId) logs = logs.filter((l) => l.projectId === projectId);
    if (environmentId) logs = logs.filter((l) => l.environmentId === environmentId);
    return logs;
  }

  public getMetrics(): RealtimeMetrics {
    this.metrics.setActiveConnections(this.connectionManager.getActiveConnectionsCount());
    this.metrics.setActiveChannels(channelManager.getActiveChannelsCount());
    this.metrics.setSubscriptionsCount(subscriptionManager.getCount());
    return this.metrics.getSnapshot();
  }

  private async ingestRemoteEvent(event: RealtimeCdcEvent): Promise<void> {
    if (this.recentEventIds.has(event.eventId)) return;
    this.rememberEvent(event.eventId);
    const started = performance.now();
    this.metrics.recordEvent();
    const dispatched = this.dispatcher.dispatch(event);
    this.recordEventLog(event, dispatched, started);
  }

  public async getStatus(): Promise<{ status: string; websocket: boolean; cdc: boolean; redis: boolean }> {
    const redisHealth = await redisClient.healthCheck();
    return {
      status: this.started ? 'ok' : 'stopped',
      websocket: this.started,
      cdc: this.cdcAvailable,
      redis: redisHealth.connected,
    };
  }

  public setCdcAvailable(available: boolean): void {
    this.cdcAvailable = available;
  }

  /** Emits an application event to one isolated project/environment channel. */
  public publishChannelEvent(
    projectId: string,
    environmentId: string,
    channel: string,
    event: string,
    payload: Record<string, any>,
  ): number {
    const sent = this.broadcastManager.broadcast(projectId, environmentId, channel, event, payload);
    if (sent > 0) this.metrics.recordBroadcast();
    return sent;
  }

  private rememberEvent(eventId: string): void {
    const now = Date.now();
    this.recentEventIds.set(eventId, now);
    const cutoff = now - 5 * 60_000;
    for (const [id, createdAt] of this.recentEventIds) {
      if (createdAt < cutoff) this.recentEventIds.delete(id);
    }
  }

  public logAudit(action: string, details: {
    organizationId: string;
    projectId: string;
    environmentId: string;
    userId?: string;
    metadata?: any;
  }): void {
    try {
      db.logAudit({
        organization_id: details.organizationId,
        project_id: details.projectId,
        environment_id: details.environmentId,
        user_id: details.userId || 'system',
        action,
        resource_type: 'realtime',
        metadata: details.metadata,
      });
    } catch (err) {
      logger.error('Erro ao registrar log de auditoria realtime:', err);
    }
  }
}

export const realtimeEngine = RealtimeEngine.getInstance();
