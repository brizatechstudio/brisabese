import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { logger } from '../logger';
import { config } from '../config';
import { RealtimeCdcEvent, RealtimeOperation } from './types';
import { realtimeEngine } from './realtimeEngine';

export interface RealtimeChangeSource {
  readonly mode: string;
  start(onEvent: (event: RealtimeCdcEvent) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
  isHealthy(): boolean;
}

export interface CdcChangeInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  schema: string;
  table: string;
  operation: RealtimeOperation;
  new?: Record<string, any> | null;
  old?: Record<string, any> | null;
  requestId?: string;
  transactionId?: string;
  sequence?: number;
}

/** Convert PostgreSQL driver values into JSON-safe Realtime payloads.
 * In particular, pg returns timestamptz values as Date objects. Treating a Date
 * as a plain object later in the sanitizer produced `{}` because Date has no
 * enumerable properties. Normalize here, at the CDC boundary, so every
 * transport and event log observes the same stable representation. */
function jsonSafeValue(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => jsonSafeValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafeValue(item)]));
  }
  return value;
}

function jsonSafeRecord(value?: Record<string, any> | null): Record<string, any> | null {
  if (!value) return null;
  return jsonSafeValue(value) as Record<string, any>;
}

/**
 * Ordered bridge between PostgreSQL mutations and the Realtime engine.
 * Normal local runtime routes emit after their committed PostgreSQL writes.
 * Deployments with a logical-replication client can additionally inject a WAL
 * source through setChangeSource; the remainder stays source-agnostic.
 */
export class PostgresCdc extends EventEmitter {
  private static instance: PostgresCdc | null = null;
  private started = false;
  private sequence = 0;
  private source?: RealtimeChangeSource;
  private pending = Promise.resolve();

  private constructor() {
    super();
  }

  public static getInstance(): PostgresCdc {
    if (!PostgresCdc.instance) PostgresCdc.instance = new PostgresCdc();
    return PostgresCdc.instance;
  }

  public setChangeSource(source: RealtimeChangeSource): void {
    if (this.started) throw new Error('Change source must be configured before CDC starts.');
    this.source = source;
  }

  public async start(): Promise<void> {
    if (this.started) return;
    // CDC is also used directly by the isolated database fixture in tests.
    // Ensure its event sink is running before accepting the first mutation.
    await realtimeEngine.start();
    this.started = true;
    try {
      if (this.source) {
        await this.source.start((event) => this.enqueue(event));
        logger.info(`PostgreSQL CDC source started (${this.source.mode}).`);
      } else if (config.databaseUrl) {
        // Do not claim that a WAL stream is active until a replication adapter is supplied.
        logger.info('PostgreSQL CDC uses committed API/database mutation capture; logical replication is not configured.');
      } else {
        logger.info('PostgreSQL CDC started with Database Engine capture (no polling).');
      }
      realtimeEngine.setCdcAvailable(true);
    } catch (error) {
      realtimeEngine.setCdcAvailable(false);
      // Realtime remains available for the Database Engine source, while health
      // truthfully reports a degraded logical-replication source.
      logger.error('Logical replication source failed to start:', error);
    }
  }

  public async stop(): Promise<void> {
    if (this.source) await this.source.stop();
    await this.pending;
    this.started = false;
    realtimeEngine.setCdcAvailable(false);
  }

  public emitChange(input: CdcChangeInput): Promise<void> {
    if (!this.started) return Promise.resolve();
    if (!realtimeEngine.publicationManager.isRealtimeEnabled(input.projectId, input.environmentId, input.table, input.operation)) {
      return Promise.resolve();
    }
    const sequence = input.sequence || ++this.sequence;
    return this.enqueue({
      eventId: `evt_${randomUUID()}`,
      timestamp: new Date().toISOString(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      schema: input.schema,
      table: input.table,
      operation: input.operation,
      new: jsonSafeRecord(input.new),
      old: jsonSafeRecord(input.old),
      transactionId: input.transactionId || `tx_${Date.now().toString(36)}`,
      requestId: input.requestId,
      sequence,
    });
  }

  public getStatus(): { started: boolean; available: boolean; mode: string; logicalReplication: { enabled: boolean; status: 'active' | 'disabled' | 'degraded'; reason?: string } } {
    const logicalReplication = this.source
      ? { enabled: true, status: this.source.isHealthy() ? 'active' as const : 'degraded' as const, ...(this.source.isHealthy() ? {} : { reason: 'The configured pgoutput/WAL source is unavailable.' }) }
      : config.realtime.logicalReplicationEnabled
        ? { enabled: true, status: 'degraded' as const, reason: 'Logical replication is enabled but no healthy pgoutput/WAL source is configured.' }
        : { enabled: false, status: 'disabled' as const, reason: 'Logical replication is disabled by REALTIME_LOGICAL_REPLICATION_ENABLED=false.' };
    return {
      started: this.started,
      available: this.started && (!this.source || this.source.isHealthy()),
      mode: this.source?.mode || (config.testMode ? 'test_fixture_capture' : 'application_mutation_capture'),
      logicalReplication,
    };
  }

  private enqueue(event: RealtimeCdcEvent): Promise<void> {
    // ingestCdcEvent dispatches synchronously before its transport await. Calling it
    // now preserves mutation order for local clients; pending only serializes source
    // shutdown and error observation without turning CDC into a polling queue.
    this.emit('change', event);
    const work = realtimeEngine.ingestCdcEvent(event);
    this.pending = this.pending
      .then(() => work)
      .catch((error) => logger.error('Failed to process realtime CDC event:', error));
    return work;
  }
}

export const postgresCdc = PostgresCdc.getInstance();
