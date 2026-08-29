import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool, PoolClient } from 'pg';
import { config } from '../config';
import { pgSslOptionsFromEnv } from './pg-ssl-options.cjs';
import { migrateLegacyGlobalMigrationHistory } from './legacy-compat.cjs';

const MIGRATION_LOCK_NAMESPACE = 1111901778; // Stable signed int32 namespace retained across upgrades.
const MIGRATION_LOCK_ID = 1;

function destructiveMigration(sql: string): boolean {
  return /\bDROP\s+(?:TABLE|SCHEMA|DATABASE|INDEX|TYPE)\b|\bTRUNCATE\b|\bALTER\s+TABLE\b[\s\S]*?\bDROP\s+COLUMN\b/i.test(sql);
}

export class PostgresRuntime {
  private pool: Pool | null = null;
  private initialized = false;

  private requirePool(): Pool {
    if (!this.pool) throw new Error('[BRISABASE DATABASE ERROR] PostgreSQL has not been initialized.');
    return this.pool;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    if (!config.databaseUrl) throw new Error('[BRISABASE DATABASE ERROR] DATABASE_URL is required.');
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      min: config.database.poolMin,
      max: config.database.poolMax,
      ssl: pgSslOptionsFromEnv(config.databaseUrl),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    try {
      await this.pool.query('SELECT 1');
      if (config.production) {
        const role = await this.pool.query<{ current_user: string; rolsuper: boolean }>('SELECT current_user, rolsuper FROM pg_roles WHERE rolname=current_user');
        if (role.rows[0]?.rolsuper) throw new Error('The application DATABASE_URL must use a non-superuser PostgreSQL role.');
      }
      await this.migrate();
      this.initialized = true;
    } catch (error) {
      await this.pool.end().catch(() => undefined);
      this.pool = null;
      throw new Error(`[BRISABASE DATABASE ERROR] ${error instanceof Error ? error.message : 'Unable to connect to PostgreSQL.'}`);
    }
  }

  public async query<T = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
    const result = await this.requirePool().query(text, values);
    return result.rows as T[];
  }

  public async execute(text: string, values: unknown[] = []): Promise<void> {
    await this.requirePool().query(text, values);
  }

  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.requirePool().connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async migrate(): Promise<void> {
    // Runtime traffic may use a pooled Neon/PgBouncer URL, while schema work
    // uses a direct connection when DATABASE_MIGRATION_URL is provided. Neon
    // recommends direct connections for migration tooling.
    const migrationUrl = config.databaseMigrationUrl || config.databaseUrl;
    const migrationPool = new Pool({
      connectionString: migrationUrl,
      min: 0,
      max: 1,
      ssl: pgSslOptionsFromEnv(migrationUrl),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
    const client = await migrationPool.connect();
    try {
      if (config.production) {
        const migrationRole = await client.query<{ current_user: string; rolsuper: boolean }>('SELECT current_user, rolsuper FROM pg_roles WHERE rolname=current_user');
        if (migrationRole.rows[0]?.rolsuper) throw new Error('DATABASE_MIGRATION_URL must use a non-superuser PostgreSQL role.');
      }
      await migrateLegacyGlobalMigrationHistory(client, MIGRATION_LOCK_NAMESPACE, MIGRATION_LOCK_ID);
      const migrationsPath = path.join(process.cwd(), 'server', 'db', 'migrations');
      const files = (await fs.readdir(migrationsPath)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
      for (const file of files) {
        const sql = await fs.readFile(path.join(migrationsPath, file), 'utf8');
        const checksum = crypto.createHash('sha256').update(sql).digest('hex');
        const existing = await client.query<{ checksum: string }>('SELECT checksum FROM brisabase_schema_migrations WHERE version = $1', [file]);
        if (existing.rows[0]) {
          if (existing.rows[0].checksum !== checksum) throw new Error(`Migration checksum mismatch: ${file}`);
          continue;
        }
        if (destructiveMigration(sql) && process.env.BRISABASE_ALLOW_DESTRUCTIVE_MIGRATIONS !== 'true') {
          throw new Error(`Migration ${file} contains a destructive operation. Explicit approval is required via BRISABASE_ALLOW_DESTRUCTIVE_MIGRATIONS=true.`);
        }
        try {
          await client.query('BEGIN');
          // Transaction-scoped locks are safe behind PgBouncer transaction pooling
          // (including Neon pooled endpoints): the backend connection is pinned for
          // the explicit transaction and the lock is released automatically at COMMIT.
          await client.query('SELECT pg_advisory_xact_lock($1, $2)', [MIGRATION_LOCK_NAMESPACE, MIGRATION_LOCK_ID]);
          // Re-check while holding the migration lock so a manual runner and an
          // application replica cannot race the insert.
          const lockedExisting = await client.query<{ checksum: string }>('SELECT checksum FROM brisabase_schema_migrations WHERE version = $1', [file]);
          if (lockedExisting.rows[0]) {
            if (lockedExisting.rows[0].checksum !== checksum) throw new Error(`Migration checksum mismatch: ${file}`);
            await client.query('COMMIT');
            continue;
          }
          await client.query(sql);
          await client.query('INSERT INTO brisabase_schema_migrations(version, checksum) VALUES($1, $2)', [file, checksum]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw error;
        }
      }
    } finally {
      client.release();
      await migrationPool.end();
    }
  }

  public async healthCheck(): Promise<{ status: 'ok' | 'degraded'; latencyMs: number }> {
    const start = performance.now();
    try {
      await this.requirePool().query('SELECT 1');
      return { status: 'ok', latencyMs: Math.round(performance.now() - start) };
    } catch {
      return { status: 'degraded', latencyMs: Math.round(performance.now() - start) };
    }
  }

  public async close(): Promise<void> {
    if (this.pool) await this.pool.end();
    this.pool = null;
    this.initialized = false;
  }
}

export const postgres = new PostgresRuntime();
