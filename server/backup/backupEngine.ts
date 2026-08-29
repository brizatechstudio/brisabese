import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { db } from '../db/database';
import { authDatabase } from '../db/authDatabase';
import { projectDbManager } from '../db/projectDatabase';
import { realProjectDatabase } from '../db/realProjectDatabase';
import { postgres } from '../db/postgres';
import { storageEngine } from '../storage/storageEngine';
import { realStorageEngine } from '../storage/realStorageEngine';
import { S3StorageAdapter } from '../storage/s3StorageAdapter';
import { functionEngine } from '../functions/functionEngine';
import { securityEngine } from '../security/securityEngine';
import { observability } from '../observability';
import { decryptAndVerify, encryptBackup } from './encryption';
import { BackupArtifact, BackupComponent, BackupContext, BackupManifest, BackupPayload, BackupRecord, BackupRetentionPolicy, BackupSchedule, BackupType, RestoreOptions, RestorePreview } from './types';
import { config } from '../config';
import { controlRepository } from '../db/controlRepository';
import { logger } from '../logger';

const execFileAsync = promisify(execFile);

const ALL_COMPONENTS: BackupComponent[] = ['database', 'storage', 'auth', 'functions', 'security', 'config'];
const REAL_COMPONENTS: BackupComponent[] = ['database', 'storage', 'security'];
const DEFAULT_RETENTION: BackupRetentionPolicy = { maxBackups: 30, maxAgeDays: 30 };
function scopeKey(ctx: Pick<BackupContext, 'organizationId' | 'projectId' | 'environmentId'>): string { return `${ctx.organizationId}:${ctx.projectId}:${ctx.environmentId}`; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }

export class BackupEngine {
  private records = new Map<string, BackupRecord>();
  private retention = new Map<string, BackupRetentionPolicy>();
  private schedules = new Map<string, BackupSchedule>();
  private timer: NodeJS.Timeout | null = null;
  // A restore mutates a whole project environment.  Distinct scopes may be
  // restored concurrently, but a second restore for the same scope is
  // rejected before any database or object mutation starts.
  private readonly activeRestores = new Set<string>();
  private root = process.env.BACKUP_LOCAL_DIR || path.join(process.cwd(), 'server', 'backup', 'data');
  private readonly artifactStore = new S3StorageAdapter({
    endpoint: config.storage.s3Endpoint,
    region: config.storage.s3Region,
    bucket: config.backup.bucket,
    accessKey: config.storage.s3AccessKey,
    secretKey: config.storage.s3SecretKey,
  });
  private hydrated = false;
  private hydration: Promise<void> | null = null;

  private artifactKey(record: Pick<BackupRecord, 'organizationId' | 'projectId' | 'environmentId' | 'id'>): string {
    return `backups/${record.organizationId}/${record.projectId}/${record.environmentId}/${record.id}.bbbak`;
  }

  private recordFromRow(row: any): BackupRecord | null {
    const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
    if (!metadata || typeof metadata !== 'object' || !metadata.id || !metadata.organizationId) return null;
    return { ...metadata, id: row.id, projectId: row.project_id, environmentId: row.environment_id, status: row.status || metadata.status, checksum: row.checksum || metadata.checksum } as BackupRecord;
  }

  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    if (this.hydration) return this.hydration;
    this.hydration = (async () => {
      if (config.testMode) {
        try {
          for (const name of readdirSync(this.root)) {
            if (!name.endsWith('.bbbak')) continue;
            const artifact = JSON.parse(readFileSync(path.join(this.root, name), 'utf8')) as BackupArtifact;
            if (artifact?.record?.id && artifact.record.encryption === 'aes-256-gcm') this.records.set(artifact.record.id, artifact.record);
          }
        } catch {
          // A test backup catalog is created lazily on the first snapshot.
        }
      } else {
        const rows = await postgres.query<any>('SELECT b.*, p.organization_id FROM backup_records b JOIN projects p ON p.id=b.project_id');
        for (const row of rows) {
          const record = this.recordFromRow(row);
          if (record) this.records.set(record.id, record);
        }
        const retentionRows = await postgres.query<any>('SELECT r.*,p.organization_id FROM backup_retention_policies r JOIN projects p ON p.id=r.project_id');
        for (const row of retentionRows) this.retention.set(`${row.organization_id}:${row.project_id}:${row.environment_id}`, { maxBackups: Number(row.max_backups), maxAgeDays: Number(row.max_age_days) });
        const scheduleRows = await postgres.query<any>('SELECT * FROM backup_schedules');
        for (const row of scheduleRows) this.schedules.set(row.id, { id: row.id, organizationId: row.organization_id, projectId: row.project_id, environmentId: row.environment_id, type: row.type, expression: row.expression, enabled: Boolean(row.enabled), components: typeof row.components === 'string' ? JSON.parse(row.components) : row.components, lastRunAt: row.last_run_at ? new Date(row.last_run_at).toISOString() : undefined, createdAt: new Date(row.created_at).toISOString() });
      }
      this.hydrated = true;
    })();
    try { await this.hydration; } finally { this.hydration = null; }
  }

  public async start(): Promise<void> {
    await this.hydrate();
    if (!config.backup.enabled) return;
    if (!config.testMode) await this.ensureConfiguredSchedules();
    if (!this.timer) { this.timer = setInterval(() => void this.runDueSchedules().catch((error) => logger.error('Backup scheduler iteration failed.', { reason: error instanceof Error ? error.message : String(error) })), 60_000); this.timer.unref(); }
  }
  public stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
  private assertManage(ctx: BackupContext): void { if (!['owner', 'admin', 'service', 'service_role'].includes(ctx.role)) throw new Error('Only owner/admin/service roles can manage backups.'); }
  private file(id: string): string { return path.join(this.root, `${id}.bbbak`); }
  private async audit(ctx: BackupContext, action: string, resourceId: string, metadata?: Record<string, unknown>): Promise<void> {
    const entry = { organization_id: ctx.organizationId, project_id: ctx.projectId, environment_id: ctx.environmentId, user_id: ctx.userId || 'system', action, resource_type: 'backup', resource_id: resourceId, metadata: { ...metadata, requestId: ctx.requestId }, ip_address: ctx.ip, user_agent: ctx.userAgent };
    if (config.testMode) db.logAudit(entry);
    else await controlRepository.logAudit(entry);
  }
  private async persist(artifact: BackupArtifact): Promise<void> {
    await this.hydrate();
    if (config.testMode) {
      await mkdir(this.root, { recursive: true });
      await writeFile(this.file(artifact.record.id), JSON.stringify(artifact), { encoding: 'utf8', mode: 0o600 });
    } else {
      const storageKey = this.artifactKey(artifact.record);
      await this.artifactStore.putObject(storageKey, Buffer.from(JSON.stringify(artifact), 'utf8'), 'application/json');
      await postgres.execute('INSERT INTO backup_records(id,project_id,environment_id,storage_key,status,checksum,encrypted,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6,TRUE,$7,$8) ON CONFLICT(id) DO UPDATE SET storage_key=EXCLUDED.storage_key,status=EXCLUDED.status,checksum=EXCLUDED.checksum,encrypted=EXCLUDED.encrypted,metadata=EXCLUDED.metadata', [artifact.record.id,artifact.record.projectId,artifact.record.environmentId,storageKey,artifact.record.status,artifact.record.checksum,JSON.stringify(artifact.record),artifact.record.createdAt]);
    }
    this.records.set(artifact.record.id, artifact.record);
  }
  private async saveRecord(record: BackupRecord): Promise<void> {
    this.records.set(record.id, record);
    if (!config.testMode) await postgres.execute('UPDATE backup_records SET status=$2,checksum=$3,metadata=$4 WHERE id=$1', [record.id,record.status,record.checksum,JSON.stringify(record)]);
  }
  private async getRecord(id: string): Promise<BackupRecord | undefined> {
    await this.hydrate();
    if (config.testMode) return this.records.get(id);
    const row = (await postgres.query<any>('SELECT b.*, p.organization_id FROM backup_records b JOIN projects p ON p.id=b.project_id WHERE b.id=$1', [id]))[0];
    const record = row ? this.recordFromRow(row) || undefined : undefined;
    if (record) this.records.set(record.id, record);
    return record;
  }
  private async artifact(id: string): Promise<BackupArtifact> {
    const record = await this.getRecord(id);
    if (!record) throw new Error('Backup not found.');
    if (config.testMode) return JSON.parse(await readFile(this.file(id), 'utf8')) as BackupArtifact;
    const content = await this.artifactStore.getObject(this.artifactKey(record));
    if (!content) throw new Error('Backup artifact is missing from backup storage.');
    return JSON.parse(content.toString('utf8')) as BackupArtifact;
  }
  private async payload(id: string, visited = new Set<string>()): Promise<BackupPayload> {
    if (visited.has(id)) throw new Error('Backup chain cycle detected.'); visited.add(id); const parsed = JSON.parse(decryptAndVerify(await this.artifact(id))) as BackupPayload;
    if (!parsed.baseBackupId) return parsed;
    const base = await this.payload(parsed.baseBackupId, visited); return { ...parsed, components: { ...base.components, ...parsed.components } };
  }

  /** Runs pg_dump against the real PostgreSQL database for the project schema. */
  private async dumpPostgresSchema(ctx: BackupContext): Promise<{ dump: Buffer; schema: string; checksum: string }> {
    if (config.testMode) {
      // Test mode uses the in-memory project database engine.
      const state = projectDbManager.exportBackupState(ctx.organizationId, ctx.projectId, ctx.environmentId);
      const dump = Buffer.from(JSON.stringify(state), 'utf8');
      const checksum = createHash('sha256').update(dump).digest('hex');
      return { dump, schema: 'test-fixture', checksum };
    }
    if (!config.databaseUrl) throw new Error('DATABASE_URL is required for real PostgreSQL backups.');
    const schema = await realProjectDatabase.getSchemaName({ organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId });
    const url = new URL(config.databaseUrl);
    const host = url.hostname;
    const port = url.port || '5432';
    const database = url.pathname.replace(/^\//, '');
    const user = url.username;
    const password = url.password;
    const args = [
      '--host', host,
      '--port', port,
      '--username', user,
      '--dbname', database,
      '--schema', schema,
      '--format', 'custom',
      '--no-owner',
      '--no-privileges',
    ];
    const env = { ...process.env, PGPASSWORD: password };
    const { stdout } = await execFileAsync('pg_dump', args, { env, maxBuffer: 1024 * 1024 * 1024, encoding: 'buffer' });
    const dump = Buffer.from(stdout);
    const checksum = createHash('sha256').update(dump).digest('hex');
    return { dump, schema, checksum };
  }

  /** Restores a pg_dump custom-format archive into the project schema. */
  private async restorePostgresSchema(ctx: BackupContext, dump: Buffer, schema: string): Promise<void> {
    if (config.testMode) {
      const state = JSON.parse(dump.toString('utf8'));
      projectDbManager.restoreBackupState(ctx.organizationId, ctx.projectId, ctx.environmentId, state);
      return;
    }
    if (!config.databaseUrl) throw new Error('DATABASE_URL is required for real PostgreSQL restores.');
    const url = new URL(config.databaseUrl);
    const host = url.hostname;
    const port = url.port || '5432';
    const database = url.pathname.replace(/^\//, '');
    const user = url.username;
    const password = url.password;
    const tmpFile = path.join(this.root, `restore_${randomUUID()}.dump`);
    await mkdir(this.root, { recursive: true });
    await writeFile(tmpFile, dump);
    try {
      const args = [
        '--host', host,
        '--port', port,
        '--username', user,
        '--dbname', database,
        '--schema', schema,
        '--no-owner',
        '--no-privileges',
        '--clean',
        '--if-exists',
        tmpFile,
      ];
      const env = { ...process.env, PGPASSWORD: password };
      try {
        await execFileAsync('pg_restore', args, { env, maxBuffer: 1024 * 1024 * 1024 });
      } catch (err: any) {
        // Capture stderr, exit code and command details for internal diagnostics
        const meta: Record<string, unknown> = {
          code: err?.code ?? null,
          signal: err?.signal ?? null,
          stderr: typeof err?.stderr === 'string' ? err.stderr : undefined,
          stdout: typeof err?.stdout === 'string' ? err.stdout : undefined,
          args,
        };
        try { observability.log('error', 'backup.pg_restore_failed', 'PostgreSQL restore failed.', meta, { ...ctx, service: 'backup' }); } catch { console.error('observability log failed', meta); }
        // Throw a sanitized error to avoid leaking secrets or filesystem paths
        throw new Error('PostgreSQL restore failed.');
      }
    } finally {
      await rm(tmpFile, { force: true });
    }
  }

  /** Captures real MinIO/S3 objects for the project environment. */
  private async captureStorageObjects(ctx: BackupContext): Promise<{ objects: Record<string, string>; checksum: string; bucketCount: number; objectCount: number; versionCount: number; metadata: Record<string, unknown> }> {
    if (!config.testMode) {
      const metadata = await realStorageEngine.exportBackupState({ ...ctx, role: ctx.role === 'service_role' ? 'service' : ctx.role } as any);
      const buckets = Array.isArray(metadata.buckets) ? metadata.buckets : [];
      const records = Array.isArray(metadata.objects) ? metadata.objects : [];
      const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
      const contents = new Map<string, string>(Array.isArray(metadata.contents) ? metadata.contents as Array<[string, string]> : []);
      const objects = Object.fromEntries(contents);
      const checksum = createHash('sha256').update(JSON.stringify(metadata)).digest('hex');
      return { objects, checksum, bucketCount: buckets.length, objectCount: records.length, versionCount: versions.length, metadata };
    }
    const adapter = storageEngine.getAdapter();
    const keys = storageEngine.listAllStorageKeys(ctx.projectId, ctx.environmentId);
    const buckets = storageEngine.listBucketDefinitions(ctx.projectId, ctx.environmentId);
    const objects: Record<string, string> = {};
    let versionCount = 0;
    for (const key of keys) {
      const content = await adapter.getObject(key);
      if (content) {
        objects[key] = content.toString('base64');
        if (key.includes('/v')) versionCount += 1;
      }
    }
    const checksum = createHash('sha256').update(JSON.stringify(Object.keys(objects).sort())).digest('hex');
    // Also capture the storage engine's in-memory metadata (buckets, objects, versions).
    const metadata = await storageEngine.exportBackupState(ctx.projectId, ctx.environmentId);
    return { objects, checksum, bucketCount: buckets.length, objectCount: Object.keys(objects).length, versionCount, metadata };
  }

  /** Restores real MinIO/S3 objects for the project environment. */
  private async restoreStorageObjects(ctx: BackupContext, objects: Record<string, string>, metadata?: Record<string, unknown>): Promise<void> {
    if (!config.testMode && metadata) {
      try {
        await realStorageEngine.restoreBackupState({ ...ctx, role: 'service', bypassRls: true } as any, metadata);
      } catch (err: any) {
        const meta: Record<string, unknown> = { message: err?.message ?? String(err), stack: undefined, metadata };
        try { observability.log('error', 'backup.storage_restore_failed', 'Storage restore failed.', meta, { ...ctx, service: 'backup' }); } catch { console.error('observability log failed', meta); }
        throw new Error('Storage restore failed.');
      }
      return;
    }
    // The storage engine's restoreBackupState handles both physical object bytes
    // and in-memory metadata (buckets, objects, versions) in one operation.
    if (metadata) {
      await storageEngine.restoreBackupState({ ...ctx, role: 'service', bypassRls: true } as any, metadata);
      return;
    }
    // Fallback: if metadata is unavailable, restore raw object bytes directly.
    const adapter = storageEngine.getAdapter();
    for (const [key, base64] of Object.entries(objects)) {
      try {
        await adapter.putObject(key, Buffer.from(base64, 'base64'), 'application/octet-stream');
      } catch (err: any) {
        const meta: Record<string, unknown> = { key, message: err?.message ?? String(err) };
        try { observability.log('error', 'backup.storage_object_put_failed', 'Storage object restore failed.', meta, { ...ctx, service: 'backup' }); } catch { console.error('observability log failed', meta); }
        throw new Error('Storage object restore failed.');
      }
    }
  }

  private async capture(ctx: BackupContext, components: BackupComponent[]): Promise<Partial<Record<BackupComponent, unknown>>> {
    const functionContext = { ...ctx };
    const securityContext = { ...ctx, role: ctx.role === 'service_role' ? 'service' : ctx.role } as any;
    const data: Partial<Record<BackupComponent, unknown>> = {};
    if (components.includes('database')) {
      const { dump, schema, checksum } = await this.dumpPostgresSchema(ctx);
      data.database = { format: 'pg_dump-custom', schema, dump: dump.toString('base64'), checksum };
    }
    if (components.includes('storage')) {
      const storage = await this.captureStorageObjects(ctx);
      data.storage = storage;
    }
    if (config.testMode && components.includes('auth')) data.auth = authDatabase.exportBackupState(ctx.projectId, ctx.environmentId);
    if (components.includes('functions')) data.functions = functionEngine.exportBackupState(functionContext);
    if (components.includes('security')) data.security = securityEngine.exportBackupState(securityContext);
    // In real (non-test) mode, the control-plane config is sourced from real PostgreSQL,
    // not the legacy in-memory database. Skipping config avoids serializing ephemeral
    // in-memory state that pg_dump already captures.
    if (components.includes('config') && config.testMode) {
      data.config = db.exportProjectBackupState(ctx.organizationId, ctx.projectId, ctx.environmentId);
    }
    return data;
  }

  public async createBackup(ctx: BackupContext, input: { type?: BackupType; components?: BackupComponent[] } = {}): Promise<BackupRecord> {
    this.assertManage(ctx);
    await this.hydrate();
    const requestedType = input.type || 'full';
    const supported = config.testMode ? ALL_COMPONENTS : REAL_COMPONENTS;
    const requested = input.components?.length ? Array.from(new Set(input.components)) : supported;
    const unsupported = requested.filter((component) => !supported.includes(component));
    if (unsupported.length) throw new Error(`Unsupported backup components in the real runtime: ${unsupported.join(', ')}.`);
    const components = requested;
    const current = await this.capture(ctx, components);
    const scoped = await this.listBackupsAsync(ctx);
    const base = requestedType === 'incremental' ? scoped[0] : requestedType === 'differential' ? scoped.find((record) => record.type === 'full') : undefined;
    let selected = current;
    let baseBackupId: string | undefined;
    if (base) {
      const baseline = await this.payload(base.id);
      selected = {};
      for (const [name, value] of Object.entries(current) as Array<[BackupComponent, unknown]>) {
        if (JSON.stringify(value) !== JSON.stringify(baseline.components[name])) selected[name] = value;
      }
      baseBackupId = base.id;
    }
    const id = `bak_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const now = new Date().toISOString();
    const record: BackupRecord = {
      id, organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId,
      type: requestedType, status: 'completed', components, baseBackupId,
      walPosition: `snapshot_${Date.now().toString(36)}`, createdAt: now, completedAt: now,
      sizeBytes: 0, checksum: '', cipherChecksum: '', signature: '', encryption: 'aes-256-gcm',
      integrity: 'pending', createdBy: ctx.userId || 'system',
    };

    // Build the manifest with real backup metadata.
    const databaseInfo = selected.database as { format: string; schema: string; dump: string; checksum: string } | undefined;
    const storageInfo = selected.storage as { objects: Record<string, string>; checksum: string; bucketCount: number; objectCount: number; versionCount: number } | undefined;
    const manifest: BackupManifest = {
      schemaVersion: '2.0',
      backupId: id,
      createdAt: now,
      organization: ctx.organizationId,
      project: ctx.projectId,
      environment: ctx.environmentId,
      database: databaseInfo ? { format: 'pg_dump-custom', schema: databaseInfo.schema, dumpFile: 'database.dump', checksum: databaseInfo.checksum } : null,
      storage: storageInfo ? { buckets: storageInfo.bucketCount, objects: storageInfo.objectCount, versions: storageInfo.versionCount, checksum: storageInfo.checksum } : null,
      checksums: {},
    };
    if (databaseInfo) manifest.checksums['database.dump'] = databaseInfo.checksum;
    if (storageInfo) manifest.checksums['storage'] = storageInfo.checksum;

    const payload: BackupPayload = {
      schemaVersion: '2.0',
      createdAt: now,
      scope: { organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId },
      manifest,
      components: selected,
      baseBackupId,
      walPosition: record.walPosition,
    };
    const artifact = encryptBackup(record, JSON.stringify(payload));
    artifact.record.sizeBytes = Buffer.byteLength(JSON.stringify(artifact));
    artifact.record.integrity = 'verified';
    await this.persist(artifact);
    await this.audit(ctx, 'backup.created', id, { type: requestedType, components, baseBackupId });
    observability.metric('backup.created', 1, 'counter', { type: requestedType }, { ...ctx, service: 'backup' });
    await this.enforceRetention(ctx);
    return clone(artifact.record);
  }

  public listBackups(ctx: Pick<BackupContext, 'organizationId' | 'projectId' | 'environmentId'>): BackupRecord[] {
    // Synchronous listing is retained only for the explicit in-memory test
    // fixture. Real runtime callers use listBackupsAsync, whose source of
    // truth is PostgreSQL rather than this process cache.
    return Array.from(this.records.values())
      .filter((record) => record.organizationId === ctx.organizationId && record.projectId === ctx.projectId && record.environmentId === ctx.environmentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(clone);
  }

  public async listBackupsAsync(ctx: Pick<BackupContext, 'organizationId' | 'projectId' | 'environmentId'>): Promise<BackupRecord[]> {
    await this.hydrate();
    if (config.testMode) return this.listBackups(ctx);
    const rows = await postgres.query<any>('SELECT b.*, p.organization_id FROM backup_records b JOIN projects p ON p.id=b.project_id WHERE b.project_id=$1 AND b.environment_id=$2 ORDER BY b.created_at DESC', [ctx.projectId, ctx.environmentId]);
    return rows.map((row) => this.recordFromRow(row))
      .filter((record): record is BackupRecord => record !== null)
      .filter((record) => record.organizationId === ctx.organizationId)
      .map((record) => {
      this.records.set(record.id, record);
      return clone(record);
    });
  }

  public async verifyBackup(ctx: BackupContext, id: string): Promise<{ valid: boolean; checksum: string }> {
    this.assertManage(ctx);
    const record = await this.getRecord(id);
    if (!record || scopeKey(record) !== scopeKey(ctx)) throw new Error('Backup not found.');
    try {
      const payload = await this.payload(id);
      // Verify the manifest checksums against the actual payload.
      if (payload.manifest.database) {
        const dbComponent = payload.components.database as { checksum: string } | undefined;
        if (dbComponent && dbComponent.checksum !== payload.manifest.database.checksum) throw new Error('Database checksum mismatch in manifest.');
      }
      if (payload.manifest.storage) {
        const storageComponent = payload.components.storage as { checksum: string } | undefined;
        if (storageComponent && storageComponent.checksum !== payload.manifest.storage.checksum) throw new Error('Storage checksum mismatch in manifest.');
      }
      record.integrity = 'verified';
      await this.saveRecord(record);
      return { valid: true, checksum: record.checksum };
    } catch (error: any) {
      record.integrity = 'failed';
      record.status = 'failed';
      await this.saveRecord(record);
      await this.audit(ctx, 'integrity.failed', id, { reason: error.message });
      throw error;
    }
  }

  public async previewRestore(ctx: BackupContext, id: string, options: RestoreOptions = {}): Promise<RestorePreview> {
    this.assertManage(ctx);
    if (!config.testMode && (options.tableName || options.bucketName || options.functionId)) throw new Error('Partial restore by table, bucket, or function is not implemented. Restore a supported full component instead.');
    const record = await this.getRecord(id);
    if (!record || scopeKey(record) !== scopeKey(ctx)) throw new Error('Backup not found.');
    const payload = await this.payload(id);
    const available = Object.keys(payload.components) as BackupComponent[];
    const components = options.components?.length
      ? options.components.filter((component) => available.includes(component))
      : available;
    const impact: Record<string, unknown> = {};
    if (components.includes('database')) {
      const db = payload.components.database as { schema: string } | undefined;
      impact.database = { schema: db?.schema || 'unknown', tableName: options.tableName };
    }
    if (components.includes('storage')) {
      const storage = payload.components.storage as { bucketCount: number; objectCount: number } | undefined;
      impact.storage = { buckets: storage?.bucketCount || 0, objects: storage?.objectCount || 0, bucketName: options.bucketName };
    }
    if (components.includes('functions')) impact.functions = { functions: (payload.components.functions as any)?.functions?.length || 0, functionId: options.functionId };
    if (components.includes('auth')) impact.auth = { users: (payload.components.auth as any)?.users?.length || 0 };
    if (components.includes('security')) impact.security = { policies: (payload.components.security as any)?.policies?.length || 0 };
    return { backupId: id, type: record.type, components, impact, pointInTime: record.createdAt, requiresConfirm: true };
  }

  public async restoreBackup(ctx: BackupContext, id: string, options: RestoreOptions = {}): Promise<RestorePreview> {
    this.assertManage(ctx);
    const restoreKey = scopeKey(ctx);
    if (this.activeRestores.has(restoreKey)) throw new Error('A restore is already in progress for this project environment.');
    const preview = await this.previewRestore(ctx, id, options);
    if (options.dryRun) return preview;
    // Restore requires explicit confirmation to prevent accidental overwrites.
    // Test mode is exempt because tests explicitly exercise restore flows.
    if (!config.testMode && !options.confirm) throw new Error('Restore requires explicit confirmation. Set confirm=true to proceed.');
    const record = await this.getRecord(id);
    if (!record) throw new Error('Backup not found.');
    this.activeRestores.add(restoreKey);
    record.status = 'restoring';
    await this.saveRecord(record);
    try {
      const payload = await this.payload(id);
      const components = preview.components;
      if (components.includes('database') && payload.components.database) {
        const dbComponent = payload.components.database as { dump: string; schema: string };
        await this.restorePostgresSchema(ctx, Buffer.from(dbComponent.dump, 'base64'), dbComponent.schema);
      }
      if (components.includes('storage') && payload.components.storage) {
        const storageComponent = payload.components.storage as { objects: Record<string, string>; metadata?: Record<string, unknown> };
        await this.restoreStorageObjects(ctx, storageComponent.objects, storageComponent.metadata);
      }
      // Auth and config are captured only in test mode (in-memory fixtures).
      // In real mode, auth and config data live in real PostgreSQL and are
      // already restored by the pg_dump restore.
      if (config.testMode && components.includes('auth') && payload.components.auth) authDatabase.restoreBackupState(ctx.projectId, ctx.environmentId, payload.components.auth);
      if (components.includes('functions') && payload.components.functions) functionEngine.restoreBackupState(ctx, payload.components.functions, { functionId: options.functionId });
      if (components.includes('security') && payload.components.security) await securityEngine.restoreBackupState({ ...ctx, role: ctx.role === 'service_role' ? 'service' : ctx.role } as any, payload.components.security);
      if (config.testMode && components.includes('config') && payload.components.config) db.restoreProjectBackupState(ctx.organizationId, ctx.projectId, ctx.environmentId, payload.components.config);
      record.status = 'completed';
      record.integrity = 'verified';
      await this.saveRecord(record);
      await this.audit(ctx, 'backup.restored', id, { components });
      observability.metric('backup.restored', 1, 'counter', {}, { ...ctx, service: 'backup' });
      return preview;
    } catch (error: any) {
      record.status = 'failed';
      await this.saveRecord(record);
      await this.audit(ctx, 'restore.failed', id, { reason: error.message });
      observability.metric('backup.restore_failed', 1, 'counter', {}, { ...ctx, service: 'backup' });
      throw error;
    } finally {
      this.activeRestores.delete(restoreKey);
    }
  }

  public async restorePointInTime(ctx: BackupContext, timestamp: string, options: RestoreOptions = {}): Promise<RestorePreview> {
    if (!config.testMode) throw new Error('Point-in-time recovery is not implemented by the embedded backup engine. Configure PostgreSQL WAL archiving externally.');
    const at = Date.parse(timestamp);
    if (!Number.isFinite(at)) throw new Error('Invalid PITR timestamp.');
    const backup = (await this.listBackupsAsync(ctx)).filter((item) => Date.parse(item.createdAt) <= at).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!backup) throw new Error('No backup is available before the requested point in time.');
    return this.restoreBackup(ctx, backup.id, options);
  }

  public async deleteBackup(ctx: BackupContext, id: string): Promise<boolean> {
    this.assertManage(ctx);
    const record = await this.getRecord(id);
    if (!record || scopeKey(record) !== scopeKey(ctx)) return false;
    if ((await this.listBackupsAsync(ctx)).some((item) => item.baseBackupId === id)) throw new Error('Backup is a base for an incremental chain and cannot be deleted.');
    if (config.testMode) await rm(this.file(id), { force: true });
    else {
      await this.artifactStore.deleteObject(this.artifactKey(record));
      await postgres.execute('DELETE FROM backup_records WHERE id=$1', [id]);
    }
    this.records.delete(id);
    await this.audit(ctx, 'backup.deleted', id);
    return true;
  }

  public getRetention(ctx: BackupContext): BackupRetentionPolicy { return { ...(this.retention.get(scopeKey(ctx)) || DEFAULT_RETENTION) }; }
  public async setRetention(ctx: BackupContext, policy: Partial<BackupRetentionPolicy>): Promise<BackupRetentionPolicy> {
    this.assertManage(ctx);
    const next = { ...this.getRetention(ctx), ...policy };
    if (!Number.isInteger(next.maxBackups) || next.maxBackups < 1 || !Number.isInteger(next.maxAgeDays) || next.maxAgeDays < 1) throw new Error('Invalid backup retention policy.');
    this.retention.set(scopeKey(ctx), next);
    if (!config.testMode) await postgres.execute('INSERT INTO backup_retention_policies(project_id,environment_id,max_backups,max_age_days,updated_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(project_id,environment_id) DO UPDATE SET max_backups=EXCLUDED.max_backups,max_age_days=EXCLUDED.max_age_days,updated_at=now()', [ctx.projectId,ctx.environmentId,next.maxBackups,next.maxAgeDays]);
    await this.enforceRetention(ctx);
    return next;
  }
  public async enforceRetention(ctx: BackupContext): Promise<number> {
    const policy = this.getRetention(ctx);
    const cutoff = Date.now() - policy.maxAgeDays * 86_400_000;
    const all = await this.listBackupsAsync(ctx);
    const candidates = all.filter((record, index) => index >= policy.maxBackups || Date.parse(record.createdAt) < cutoff);
    let deleted = 0;
    for (const record of candidates) {
      if (all.some((item) => item.baseBackupId === record.id)) continue;
      if (await this.deleteBackup(ctx, record.id)) deleted += 1;
    }
    return deleted;
  }
  public async createSchedule(ctx: BackupContext, input: { expression: string; type?: BackupType; components?: BackupComponent[] }): Promise<BackupSchedule> {
    this.assertManage(ctx);
    if (!input.expression?.trim()) throw new Error('Backup schedule expression is required.');
    this.validateScheduleExpression(String(input.expression).trim());
    const schedule: BackupSchedule = {
      id: `bks_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId,
      type: input.type || 'full', expression: input.expression.trim(), enabled: true,
      components: input.components?.length ? input.components : (config.testMode ? ALL_COMPONENTS : REAL_COMPONENTS),
      createdAt: new Date().toISOString(),
    };
    const unsupported = schedule.components.filter((component) => !(config.testMode ? ALL_COMPONENTS : REAL_COMPONENTS).includes(component));
    if (unsupported.length) throw new Error(`Unsupported scheduled backup components: ${unsupported.join(', ')}.`);
    this.schedules.set(schedule.id, schedule);
    if (!config.testMode) await postgres.execute('INSERT INTO backup_schedules(id,organization_id,project_id,environment_id,type,expression,enabled,components,last_run_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9)', [schedule.id,schedule.organizationId,schedule.projectId,schedule.environmentId,schedule.type,schedule.expression,schedule.enabled,JSON.stringify(schedule.components),schedule.createdAt]);
    return clone(schedule);
  }
  public listSchedules(ctx: BackupContext): BackupSchedule[] { return Array.from(this.schedules.values()).filter((item) => scopeKey(item) === scopeKey(ctx)).map(clone); }
  public async updateSchedule(ctx: BackupContext, id: string, patch: { enabled?: boolean; expression?: string }): Promise<BackupSchedule> {
    this.assertManage(ctx); await this.hydrate(); const current=this.schedules.get(id); if(!current||scopeKey(current)!==scopeKey(ctx)) throw new Error('Backup schedule not found.');
    const next={...current,...(patch.expression!==undefined?{expression:String(patch.expression).trim()}:{}),...(patch.enabled!==undefined?{enabled:Boolean(patch.enabled)}:{})};
    if(!next.expression) throw new Error('Backup schedule expression is required.'); this.validateScheduleExpression(next.expression); this.schedules.set(id,next);
    if(!config.testMode) await postgres.execute('UPDATE backup_schedules SET expression=$2,enabled=$3 WHERE id=$1',[id,next.expression,next.enabled]); return clone(next);
  }
  public async deleteSchedule(ctx: BackupContext, id: string): Promise<boolean> {
    this.assertManage(ctx); await this.hydrate(); const current=this.schedules.get(id); if(!current||scopeKey(current)!==scopeKey(ctx)) return false; this.schedules.delete(id); if(!config.testMode) await postgres.execute('DELETE FROM backup_schedules WHERE id=$1',[id]); return true;
  }
  public async runDueSchedules(now = new Date()): Promise<number> {
    let ran = 0;
    for (const schedule of this.schedules.values()) {
      if (!schedule.enabled || !this.scheduleMatches(schedule.expression, now) || schedule.lastRunAt?.slice(0, 16) === now.toISOString().slice(0, 16)) continue;
      try {
        await this.createBackup({ organizationId: schedule.organizationId, projectId: schedule.projectId, environmentId: schedule.environmentId, role: 'service', userId: 'backup-scheduler' }, { type: schedule.type, components: schedule.components });
        schedule.lastRunAt = now.toISOString();
        this.schedules.set(schedule.id, schedule);
        if (!config.testMode) await postgres.execute('UPDATE backup_schedules SET last_run_at=$2 WHERE id=$1', [schedule.id,schedule.lastRunAt]);
        ran += 1;
      } catch (error) {
        logger.error('Scheduled backup failed.', { scheduleId: schedule.id, projectId: schedule.projectId, environmentId: schedule.environmentId, reason: error instanceof Error ? error.message : String(error) });
      }
    }
    return ran;
  }
  private async ensureConfiguredSchedules(): Promise<void> {
    if (!config.backup.schedule) return;
    const scopes = await postgres.query<{ organization_id: string; project_id: string; environment_id: string }>('SELECT p.organization_id,e.project_id,e.id AS environment_id FROM project_environments e JOIN projects p ON p.id=e.project_id');
    for (const scope of scopes) {
      if (Array.from(this.schedules.values()).some((item) => item.projectId === scope.project_id && item.environmentId === scope.environment_id)) continue;
      await this.createSchedule({ organizationId: scope.organization_id, projectId: scope.project_id, environmentId: scope.environment_id, role: 'service', userId: 'backup-scheduler' }, { expression: config.backup.schedule, type: 'full', components: REAL_COMPONENTS });
    }
  }
  private validateScheduleExpression(expression: string): void {
    const value = expression.trim().toLowerCase();
    if (['daily','weekly','monthly'].includes(value)) return;
    const parts = value.split(/\s+/);
    if (parts.length !== 5) throw new Error('Backup schedule must be daily/weekly/monthly or a five-field UTC cron expression.');
    const ranges: Array<[number, number]> = [[0,59],[0,23],[1,31],[1,12],[0,6]];
    parts.forEach((part,index) => {
      if (part === '*') return;
      const every = /^\*\/(\d+)$/.exec(part);
      if (every) { const step=Number(every[1]); if (step >= 1 && step <= ranges[index][1]) return; }
      if (/^\d+$/.test(part)) { const number=Number(part); const [min,max]=ranges[index]; if (number >= min && number <= max) return; }
      throw new Error(`Unsupported backup cron field '${part}' at position ${index + 1}.`);
    });
  }

  private scheduleMatches(expression: string, now: Date): boolean {
    const value = expression.toLowerCase();
    if (value === 'daily') return now.getUTCHours() === 3 && now.getUTCMinutes() === 0;
    if (value === 'weekly') return now.getUTCDay() === 0 && now.getUTCHours() === 3 && now.getUTCMinutes() === 0;
    if (value === 'monthly') return now.getUTCDate() === 1 && now.getUTCHours() === 3 && now.getUTCMinutes() === 0;
    const [minute = '*', hour = '*', day = '*', month = '*', weekDay = '*'] = value.split(/\s+/);
    const match = (part: string, actual: number) => part === '*' || part === String(actual) || (/^\*\/(\d+)$/.test(part) && actual % Number(part.slice(2)) === 0);
    return match(minute, now.getUTCMinutes()) && match(hour, now.getUTCHours()) && match(day, now.getUTCDate()) && match(month, now.getUTCMonth() + 1) && match(weekDay, now.getUTCDay());
  }
  public async exportArtifact(ctx: BackupContext, id: string): Promise<Buffer> {
    this.assertManage(ctx);
    const record = await this.getRecord(id);
    if (!record || scopeKey(record) !== scopeKey(ctx)) throw new Error('Backup not found.');
    if (config.testMode) return readFile(this.file(id));
    const artifact = await this.artifactStore.getObject(this.artifactKey(record));
    if (!artifact) throw new Error('Backup artifact is missing from backup storage.');
    return artifact;
  }
}

export const backupEngine = new BackupEngine();
