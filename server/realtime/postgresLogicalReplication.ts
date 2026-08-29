import { randomUUID } from 'node:crypto';
import { LogicalReplicationService, Pgoutput, PgoutputPlugin } from 'pg-logical-replication';
import { logger } from '../logger';
import { RealtimeCdcEvent } from './types';
import { RealtimeChangeSource } from './postgresCdc';

export interface PostgresLogicalReplicationOptions {
  connectionString: string;
  slotName: string;
  publicationName: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
}

/**
 * Native PostgreSQL pgoutput/WAL source. The replication slot and publication
 * are intentionally provisioned outside the application: running code must
 * never alter production WAL settings or add tables to a publication silently.
 */
export class PostgresLogicalReplicationSource implements RealtimeChangeSource {
  public readonly mode = 'postgres_wal_logical_replication';
  private service: LogicalReplicationService | null = null;
  private healthy = false;
  private transactionId: string | undefined;

  public constructor(private readonly options: PostgresLogicalReplicationOptions) {}

  public async start(onEvent: (event: RealtimeCdcEvent) => Promise<void>): Promise<void> {
    if (this.service && this.healthy) return;
    const service = new LogicalReplicationService(
      { connectionString: this.options.connectionString, replication: 'database' } as any,
      { acknowledge: { auto: true, timeoutSeconds: 10 }, flowControl: { enabled: true } },
    );
    this.service = service;
    const plugin = new PgoutputPlugin({ protoVersion: 1, publicationNames: [this.options.publicationName] });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.healthy = false;
        reject(error);
      };
      service.once('start', () => {
        this.healthy = true;
        resolve();
      });
      service.on('error', onError);
      service.on('data', async (lsn: string, message: Pgoutput.Message) => {
        const event = this.toCdcEvent(lsn, message);
        if (event) await onEvent(event);
      });
      void service.subscribe(plugin, this.options.slotName).catch(onError);
    });
  }

  public async stop(): Promise<void> {
    this.healthy = false;
    if (this.service) await this.service.stop();
    this.service = null;
  }

  public isHealthy(): boolean {
    return this.healthy && !!this.service && !this.service.isStop();
  }

  private toCdcEvent(lsn: string, message: Pgoutput.Message): RealtimeCdcEvent | null {
    if (message.tag === 'begin') {
      this.transactionId = `pg:${message.xid}`;
      return null;
    }
    if (message.tag === 'commit') {
      this.transactionId = undefined;
      return null;
    }
    if (message.tag === 'insert') return this.changeEvent(lsn, message.relation.schema, message.relation.name, 'INSERT', message.new, null);
    if (message.tag === 'update') return this.changeEvent(lsn, message.relation.schema, message.relation.name, 'UPDATE', message.new, message.old || message.key || null);
    if (message.tag === 'delete') return this.changeEvent(lsn, message.relation.schema, message.relation.name, 'DELETE', null, message.old || message.key || null);
    return null;
  }

  private changeEvent(
    lsn: string,
    schema: string,
    table: string,
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    next: Record<string, any> | null,
    old: Record<string, any> | null,
  ): RealtimeCdcEvent {
    return {
      eventId: `wal_${lsn.replace('/', '_')}_${randomUUID()}`,
      timestamp: new Date().toISOString(),
      organizationId: this.options.organizationId,
      projectId: this.options.projectId,
      environmentId: this.options.environmentId,
      schema: schema || 'public',
      table,
      operation,
      new: next,
      old,
      transactionId: this.transactionId || `pg:lsn:${lsn}`,
    };
  }
}
