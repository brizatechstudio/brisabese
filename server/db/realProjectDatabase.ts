import crypto from 'node:crypto';
import { postgres } from './postgres';
import { ColumnDef, DbIndexDef, DbRelationshipDef, DbSchemaDef, TableDef } from './projectDatabase';
import { prepareScopedSql, validateScopedFunctionBody } from './scopedSql';
import { migrateLegacyProjectMigrationHistory } from './legacy-compat.cjs';

type Scope = { organizationId: string; projectId: string; environmentId: string };
type ApiFilter = { field: string; operator: string; value: unknown };
type ApiSort = { field: string; order: 'asc' | 'desc' };

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const physicalType: Record<ColumnDef['type'], string> = {
  uuid: 'uuid', text: 'text', varchar: 'varchar(255)', char: 'char(1)', integer: 'integer', bigint: 'bigint',
  numeric: 'numeric', decimal: 'decimal', real: 'real', 'double precision': 'double precision', boolean: 'boolean', date: 'date',
  timestamp: 'timestamp', timestamptz: 'timestamptz', json: 'json', jsonb: 'jsonb',
};

function quote(name: string): string {
  if (!identifier.test(name)) throw new Error(`Invalid PostgreSQL identifier: ${name}`);
  return `"${name}"`;
}

function stableSchemaName(projectId: string, environmentId: string): string {
  return `bb_${crypto.createHash('sha256').update(`${projectId}:${environmentId}`).digest('hex').slice(0, 24)}`;
}

function typeFromPg(type: string): ColumnDef['type'] {
  const value = type.toLowerCase();
  if (value.includes('uuid')) return 'uuid';
  if (value.includes('character varying')) return 'varchar';
  if (value === 'character') return 'char';
  if (value.includes('bigint')) return 'bigint';
  if (value.includes('integer')) return 'integer';
  if (value.includes('boolean')) return 'boolean';
  if (value === 'date') return 'date';
  if (value.includes('timestamp with time zone')) return 'timestamptz';
  if (value.includes('timestamp')) return 'timestamp';
  if (value === 'json') return 'json';
  if (value.includes('json')) return 'jsonb';
  if (value.includes('decimal')) return 'decimal';
  if (value.includes('numeric')) return 'numeric';
  if (value.includes('double')) return 'double precision';
  if (value.includes('real')) return 'real';
  return 'text';
}

function safeDefault(value: string | undefined, type: ColumnDef['type'], primary: boolean): string {
  if (!value && primary && type === 'uuid') return ' DEFAULT gen_random_uuid()';
  if (!value) return '';
  const normalized = value.trim();
  if (/^(?:now\(\)|gen_random_uuid\(\)|true|false|null|-?\d+(?:\.\d+)?|'(?:''|[^'])*')$/i.test(normalized)) return ` DEFAULT ${normalized}`;
  throw new Error('Unsupported column default expression.');
}

/**
 * Persistent project data-plane. Every environment receives an opaque PostgreSQL
 * schema; the public API exposes it as `public`, never leaking the physical name.
 */
export class RealProjectDatabase {
  // Project schemas are immutable for the lifetime of this process: the public
  // API permits table deletion but never schema deletion. Caching avoids four
  // registry/DDL round-trips for each REST read under concurrent load.
  private schemaNames = new Map<string, string>();
  private schemaCreationPromises = new Map<string, Promise<string>>();
  private activeQueries = new Map<string, { backendPid: number; scopeKey: string }>();

  /** Exposes the physical PostgreSQL schema name for a project environment. */
  public async getSchemaName(scope: Scope): Promise<string> {
    return this.schema(scope);
  }

  private scopeKey(scope: Scope): string { return `${scope.organizationId}:${scope.projectId}:${scope.environmentId}`; }

  private async schema(scope: Scope): Promise<string> {
    const lockKey = `${scope.projectId}:${scope.environmentId}`;
    const cached = this.schemaNames.get(lockKey);
    if (cached) return cached;
    const existing = this.schemaCreationPromises.get(lockKey);
    if (existing) return existing;

    const promise = (async () => {
      const rows = await postgres.query<{ schema_name: string }>('SELECT schema_name FROM project_database_registry WHERE project_id=$1 AND environment_id=$2', [scope.projectId, scope.environmentId]);
      const schemaName = rows[0]?.schema_name || stableSchemaName(scope.projectId, scope.environmentId);
      if (!rows[0]) {
        await postgres.execute('INSERT INTO project_database_registry(project_id,environment_id,schema_name) VALUES($1,$2,$3) ON CONFLICT(project_id,environment_id) DO NOTHING', [scope.projectId, scope.environmentId, schemaName]);
      }
      try {
        await postgres.execute(`CREATE SCHEMA IF NOT EXISTS ${quote(schemaName)}`);
      } catch (error: any) {
        if (String(error?.code) === '23505') {
          // Concurrent schema creation can race on the same physical namespace.
          // If the schema already exists, ignore the duplicate-key conflict.
        } else {
          throw error;
        }
      }
      await postgres.transaction(async (client) => {
        await migrateLegacyProjectMigrationHistory(client, schemaName);
      });
      this.schemaNames.set(lockKey, schemaName);
      return schemaName;
    })();

    this.schemaCreationPromises.set(lockKey, promise);
    try {
      return await promise;
    } finally {
      this.schemaCreationPromises.delete(lockKey);
    }
  }

  private async tableExists(schema: string, tableName: string): Promise<boolean> {
    return (await postgres.query<{ exists: boolean }>('SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name=$2) AS exists', [schema, tableName]))[0]?.exists === true;
  }

  private async internalTables(schema: string): Promise<void> {
    await postgres.execute(`CREATE TABLE IF NOT EXISTS ${quote(schema)}."__brisabase_migrations" (id varchar(64) primary key,version varchar(128) not null,name varchar(255) not null,sql_up text,sql_down text,applied_at timestamptz not null default now(),execution_time_ms integer not null,status varchar(16) not null,checksum varchar(64),rolled_back_at timestamptz)`);
    await postgres.execute(`ALTER TABLE ${quote(schema)}."__brisabase_migrations" ADD COLUMN IF NOT EXISTS rolled_back_at timestamptz`);
  }

  private async columns(schema: string, tableName: string): Promise<ColumnDef[]> {
    const rows = await postgres.query<{ name: string; data_type: string; is_nullable: string; column_default: string | null; is_primary: boolean; is_unique: boolean }>(`
      SELECT c.column_name AS name,c.data_type,c.is_nullable,c.column_default,
        EXISTS(SELECT 1 FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
          WHERE tc.table_schema=c.table_schema AND tc.table_name=c.table_name AND tc.constraint_type='PRIMARY KEY' AND kcu.column_name=c.column_name) AS is_primary,
        EXISTS(SELECT 1 FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
          WHERE tc.table_schema=c.table_schema AND tc.table_name=c.table_name AND tc.constraint_type='UNIQUE' AND kcu.column_name=c.column_name) AS is_unique
      FROM information_schema.columns c WHERE c.table_schema=$1 AND c.table_name=$2 ORDER BY c.ordinal_position`, [schema, tableName]);
    return rows.map((row) => ({ name: row.name, type: typeFromPg(row.data_type), isPrimaryKey: row.is_primary, isNullable: row.is_nullable === 'YES', isUnique: row.is_unique, defaultValue: row.column_default || undefined }));
  }

  public async getSchemas(scope: Scope): Promise<DbSchemaDef[]> {
    await this.schema(scope);
    const tables = await this.listTables(scope);
    return [{ name: 'public', isSystem: false, tableCount: tables.length, createdAt: new Date().toISOString() }];
  }

  public async createSchema(scope: Scope, name: string): Promise<DbSchemaDef> {
    if (name !== 'public') throw new Error('Project databases expose a single isolated public schema.');
    await this.schema(scope);
    return (await this.getSchemas(scope))[0];
  }

  public async deleteSchema(_scope: Scope, name: string): Promise<boolean> {
    if (name !== 'public') return false;
    throw new Error('The public schema cannot be deleted. Delete its tables instead.');
  }

  public async listTables(scope: Scope): Promise<TableDef[]> {
    const schema = await this.schema(scope);
    const rows = await postgres.query<{ name: string }>(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r' AND c.relname NOT LIKE '__brisabase_%' ORDER BY c.relname`, [schema]);
    return Promise.all(rows.map((row) => this.tableDefinition(schema, row.name)));
  }

  public async getTable(scope: Scope, tableName: string): Promise<TableDef | null> {
    if (!identifier.test(tableName)) return null;
    const schema = await this.schema(scope);
    if (!await this.tableExists(schema, tableName)) return null;
    return this.tableDefinition(schema, tableName);
  }

  private async tableDefinition(schema: string, tableName: string): Promise<TableDef> {
    const [columns, stats] = await Promise.all([
      this.columns(schema, tableName),
      postgres.query<{ count: string; size: string }>(`SELECT count(*)::text AS count, pg_total_relation_size($1::regclass)::text AS size FROM ${quote(schema)}.${quote(tableName)}`, [`${schema}.${tableName}`]),
    ]);
    return { name: tableName, schema: 'public', columns, rowCount: Number(stats[0]?.count || 0), sizeBytes: Number(stats[0]?.size || 0), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  }

  public async createTable(scope: Scope, input: { name: string; schema?: string; columns: ColumnDef[] }): Promise<TableDef> {
    if (input.schema && input.schema !== 'public') throw new Error('Only the isolated public schema is supported.');
    if (!identifier.test(input.name) || !input.columns?.length) throw new Error('A valid table name and at least one column are required.');
    const schema = await this.schema(scope);
    const definitions = input.columns.map((column) => {
      if (!identifier.test(column.name) || !physicalType[column.type]) throw new Error(`Invalid column definition: ${column.name}`);
      return `${quote(column.name)} ${physicalType[column.type]}${column.isNullable === false || column.isPrimaryKey ? ' NOT NULL' : ''}${safeDefault(column.defaultValue, column.type, Boolean(column.isPrimaryKey))}${column.isUnique && !column.isPrimaryKey ? ' UNIQUE' : ''}`;
    });
    const primaryKeys = input.columns.filter((column) => column.isPrimaryKey).map((column) => quote(column.name));
    if (primaryKeys.length) definitions.push(`PRIMARY KEY (${primaryKeys.join(', ')})`);
    await postgres.execute(`CREATE TABLE ${quote(schema)}.${quote(input.name)} (${definitions.join(', ')})`);
    return (await this.getTable(scope, input.name))!;
  }

  public async deleteTable(scope: Scope, tableName: string): Promise<boolean> {
    const schema = await this.schema(scope);
    if (!(await this.tableExists(schema, tableName))) return false;
    await postgres.execute(`DROP TABLE ${quote(schema)}.${quote(tableName)} CASCADE`);
    return true;
  }

  public async getRows(scope: Scope, tableName: string, options: { limit?: number; offset?: number; search?: string; sortField?: string; sortOrder?: 'asc' | 'desc'; filters?: ApiFilter[]; orFilters?: ApiFilter[]; sorts?: ApiSort[] } = {}): Promise<{ rows: any[]; totalCount: number }> {
    const schema = await this.schema(scope);
    const table = await this.getTable(scope, tableName);
    if (!table) throw new Error(`Table '${tableName}' was not found.`);
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 1000);
    const offset = Math.max(Number(options.offset) || 0, 0);
    const validColumns = new Set(table.columns.map((column) => column.name));
    const sort = table.columns.some((column) => column.name === options.sortField) ? quote(options.sortField!) : quote(table.columns.find((column) => column.isPrimaryKey)?.name || table.columns[0].name);
    const direction = options.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const searchColumns = table.columns.filter((column) => ['text', 'varchar', 'char'].includes(column.type)).map((column) => column.name);
    const values: unknown[] = [];
    const condition = (filter: ApiFilter): string => {
      if (!validColumns.has(filter.field)) throw new Error(`Invalid filter column '${filter.field}'.`);
      const column = quote(filter.field);
      if (filter.operator === 'isnull') return filter.value ? `${column} IS NULL` : `${column} IS NOT NULL`;
      if (filter.operator === 'is' && filter.value === null) return `${column} IS NULL`;
      if (filter.operator === 'in') {
        if (!Array.isArray(filter.value) || filter.value.length === 0) return 'FALSE';
        values.push(filter.value); return `${column} = ANY($${values.length})`;
      }
      const operators: Record<string, string> = { eq: '=', neq: '<>', not: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', ilike: 'ILIKE' };
      let operator = operators[filter.operator]; let value = filter.value;
      if (['contains', 'starts_with', 'ends_with'].includes(filter.operator)) {
        operator = 'ILIKE';
        value = filter.operator === 'contains' ? `%${value}%` : filter.operator === 'starts_with' ? `${value}%` : `%${value}`;
      }
      if (!operator) throw new Error(`Unsupported filter operator '${filter.operator}'.`);
      values.push(value); return `${column} ${operator} $${values.length}`;
    };
    const where: string[] = [];
    if (options.search && searchColumns.length) { values.push(`%${options.search}%`); const placeholder = `$${values.length}`; where.push(`(${searchColumns.map((column) => `${quote(column)} ILIKE ${placeholder}`).join(' OR ')})`); }
    if (options.filters?.length) where.push(...options.filters.map(condition));
    if (options.orFilters?.length) where.push(`(${options.orFilters.map(condition).join(' OR ')})`);
    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const orderSql = options.sorts?.length
      ? options.sorts.map((item) => { if (!validColumns.has(item.field)) throw new Error(`Invalid sort column '${item.field}'.`); return `${quote(item.field)} ${item.order === 'desc' ? 'DESC' : 'ASC'}`; }).join(', ')
      : `${sort} ${direction}`;
    const filterValues = [...values];
    values.push(limit, offset);
    const limitPlaceholder = `$${values.length - 1}`; const offsetPlaceholder = `$${values.length}`;
    const [rows, count] = await Promise.all([
      postgres.query<any>(`SELECT * FROM ${quote(schema)}.${quote(tableName)}${whereSql} ORDER BY ${orderSql} LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`, values),
      postgres.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${quote(schema)}.${quote(tableName)}${whereSql}`, filterValues),
    ]);
    return { rows, totalCount: Number(count[0]?.count || 0) };
  }

  public async getRow(scope: Scope, tableName: string, id: unknown): Promise<any | null> {
    const schema = await this.schema(scope); const table = await this.getTable(scope, tableName); if (!table) return null;
    const primaryKeys = table.columns.filter((column) => column.isPrimaryKey);
    if (primaryKeys.length !== 1) throw new Error(primaryKeys.length ? 'Row-by-id operations require a single-column primary key. Composite primary keys must be changed through reviewed SQL.' : 'Row-by-id operations require a primary key.');
    const primary = primaryKeys[0].name;
    return (await postgres.query<any>(`SELECT * FROM ${quote(schema)}.${quote(tableName)} WHERE ${quote(primary)}=$1`, [id]))[0] || null;
  }

  public async insertRow(scope: Scope, tableName: string, data: Record<string, unknown>): Promise<any> {
    const schema = await this.schema(scope); const table = await this.getTable(scope, tableName); if (!table) throw new Error(`Table '${tableName}' was not found.`);
    const allowed = new Set(table.columns.map((column) => column.name));
    const entries = Object.entries(data).filter(([key]) => allowed.has(key));
    if (!entries.length) throw new Error('No valid columns were supplied.');
    const keys = entries.map(([key]) => quote(key));
    const values = entries.map(([, value]) => value);
    const placeholders = values.map((_, index) => `$${index + 1}`);
    return (await postgres.query<any>(`INSERT INTO ${quote(schema)}.${quote(tableName)} (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`, values))[0];
  }

  public async updateRow(scope: Scope, tableName: string, id: unknown, data: Record<string, unknown>): Promise<any | null> {
    const schema = await this.schema(scope); const table = await this.getTable(scope, tableName); if (!table) return null;
    const primaryKeys = table.columns.filter((column) => column.isPrimaryKey);
    if (primaryKeys.length !== 1) throw new Error(primaryKeys.length ? 'Visual/API row updates require a single-column primary key. Composite keys must be changed through reviewed SQL.' : 'Visual/API row updates require a primary key.');
    const primary = primaryKeys[0].name; const allowed = new Set(table.columns.map((column) => column.name));
    const entries = Object.entries(data).filter(([key]) => key !== primary && allowed.has(key));
    if (!entries.length) return this.getRow(scope, tableName, id);
    const values = entries.map(([, value]) => value); const assignments = entries.map(([key], index) => `${quote(key)}=$${index + 1}`);
    return (await postgres.query<any>(`UPDATE ${quote(schema)}.${quote(tableName)} SET ${assignments.join(', ')} WHERE ${quote(primary)}=$${values.length + 1} RETURNING *`, [...values, id]))[0] || null;
  }

  public async deleteRow(scope: Scope, tableName: string, id: unknown): Promise<boolean> {
    const schema = await this.schema(scope); const table = await this.getTable(scope, tableName); if (!table) return false;
    const primaryKeys = table.columns.filter((column) => column.isPrimaryKey);
    if (primaryKeys.length !== 1) throw new Error(primaryKeys.length ? 'Visual/API row deletion requires a single-column primary key. Composite keys must be changed through reviewed SQL.' : 'Visual/API row deletion requires a primary key.');
    const primary = primaryKeys[0].name;
    return (await postgres.query<{ [key: string]: unknown }>(`DELETE FROM ${quote(schema)}.${quote(tableName)} WHERE ${quote(primary)}=$1 RETURNING ${quote(primary)}`, [id])).length > 0;
  }

  public async getRelationships(scope: Scope): Promise<DbRelationshipDef[]> {
    const schema = await this.schema(scope);
    const rows = await postgres.query<{ id: string; from_table: string; from_column: string; to_table: string; to_column: string; on_delete: DbRelationshipDef['onDelete']; on_update: DbRelationshipDef['onUpdate'] }>(`
      SELECT tc.constraint_name AS id, tc.table_name AS from_table, kcu.column_name AS from_column, ccu.table_name AS to_table, ccu.column_name AS to_column,
        rc.delete_rule AS on_delete, rc.update_rule AS on_update
      FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema
      JOIN information_schema.referential_constraints rc ON rc.constraint_name=tc.constraint_name AND rc.constraint_schema=tc.table_schema
      WHERE tc.table_schema=$1 AND tc.constraint_type='FOREIGN KEY'`, [schema]);
    return rows.map((row) => ({ id: row.id, fromTable: row.from_table, fromColumn: row.from_column, toTable: row.to_table, toColumn: row.to_column, type: 'one-to-many', onDelete: row.on_delete, onUpdate: row.on_update }));
  }

  public async createRelationship(scope: Scope, relationship: Omit<DbRelationshipDef, 'id'>): Promise<DbRelationshipDef> {
    const schema = await this.schema(scope); const id = `fk_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`;
    const allowedActions = new Set(['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT']);
    const onDelete = String(relationship.onDelete || 'NO ACTION').toUpperCase();
    const onUpdate = String(relationship.onUpdate || 'NO ACTION').toUpperCase();
    if (!allowedActions.has(onDelete) || !allowedActions.has(onUpdate)) throw new Error('Unsupported foreign-key action.');
    await postgres.execute(`ALTER TABLE ${quote(schema)}.${quote(relationship.fromTable)} ADD CONSTRAINT ${quote(id)} FOREIGN KEY (${quote(relationship.fromColumn)}) REFERENCES ${quote(schema)}.${quote(relationship.toTable)} (${quote(relationship.toColumn)}) ON DELETE ${onDelete} ON UPDATE ${onUpdate}`);
    return { ...relationship, id };
  }

  public async getIndexes(scope: Scope): Promise<DbIndexDef[]> {
    const schema = await this.schema(scope);
    const rows = await postgres.query<{ name: string; table_name: string; definition: string; size_bytes: string }>(`
      SELECT i.indexname AS name,i.tablename AS table_name,i.indexdef AS definition,
        pg_relation_size(format('%I.%I', i.schemaname, i.indexname)::regclass)::text AS size_bytes
      FROM pg_indexes i
      WHERE i.schemaname=$1 AND i.indexname NOT LIKE '%_pkey'
      ORDER BY i.indexname`, [schema]);
    return rows.map((row) => {
      const indexType = (row.definition.match(/\bUSING\s+([A-Za-z0-9_]+)/i)?.[1] || 'btree').toLowerCase();
      return {
        id: row.name,
        name: row.name,
        tableName: row.table_name,
        columns: (row.definition.match(/\(([^)]+)\)/)?.[1] || '').split(',').map((item) => item.trim().replaceAll('"', '')).filter(Boolean),
        type: indexType as DbIndexDef['type'],
        isUnique: /CREATE UNIQUE INDEX/i.test(row.definition),
        sizeKb: Math.round(Number(row.size_bytes || 0) / 1024),
        createdAt: new Date().toISOString(),
      };
    });
  }

  public async createIndex(scope: Scope, input: Omit<DbIndexDef, 'id' | 'sizeKb' | 'createdAt'>): Promise<DbIndexDef> {
    const schema = await this.schema(scope); const name = input.name || `idx_${input.tableName}_${input.columns.join('_')}`;
    if (!input.columns.length) throw new Error('An index must have columns.');
    const indexType = String(input.type || 'btree').toLowerCase();
    if (!['btree', 'hash', 'gin', 'gist', 'brin'].includes(indexType)) throw new Error('Unsupported PostgreSQL index type.');
    await postgres.execute(`CREATE ${input.isUnique ? 'UNIQUE ' : ''}INDEX ${quote(name)} ON ${quote(schema)}.${quote(input.tableName)} USING ${indexType} (${input.columns.map(quote).join(', ')})`);
    return { id: name, name, tableName: input.tableName, columns: input.columns, type: indexType as DbIndexDef['type'], isUnique: Boolean(input.isUnique), sizeKb: 0, createdAt: new Date().toISOString() };
  }

  public async overview(scope: Scope): Promise<Record<string, unknown>> {
    const tables = await this.listTables(scope); const sizeBytes = tables.reduce((total, table) => total + table.sizeBytes, 0);
    return { status: 'connected', version: 'PostgreSQL', databaseSize: sizeBytes, tableCount: tables.length, rowCount: tables.reduce((total, table) => total + table.rowCount, 0), schemas: await this.getSchemas(scope), tables };
  }

  public async executeSql(scope: Scope, sql: string, options: { queryId?: string; timeoutMs?: number; maxRows?: number } = {}): Promise<{ rows: any[]; rowCount: number; executionTimeMs: number; columns: string[]; queryId: string; truncated: boolean }> {
    const prepared = prepareScopedSql(sql);
    const schema = await this.schema(scope);
    const started = performance.now();
    const queryId = options.queryId && /^[A-Za-z0-9_-]{8,80}$/.test(options.queryId) ? options.queryId : `qry_${crypto.randomUUID().replace(/-/g, '')}`;
    const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || 10_000, 500), 30_000);
    const maxRows = Math.min(Math.max(Number(options.maxRows) || 1_000, 1), 5_000);
    let backendPid: number | undefined;
    try {
      const result = await postgres.transaction(async (client) => {
        const pid = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        backendPid = Number(pid.rows[0]?.pid || 0);
        if (backendPid) this.activeQueries.set(queryId, { backendPid, scopeKey: this.scopeKey(scope) });
        if (prepared.readOnly) await client.query('SET LOCAL TRANSACTION READ ONLY');
        await client.query(`SET LOCAL statement_timeout = '${timeoutMs}ms'`);
        await client.query("SET LOCAL lock_timeout = '3000ms'");
        await client.query(`SET LOCAL search_path TO ${quote(schema)}, pg_catalog`);
        const executable = prepared.readOnly ? `SELECT * FROM (${prepared.sql}) AS "__brisabase_query_result" LIMIT ${maxRows + 1}` : prepared.sql;
        return client.query(executable);
      });
      const truncated = prepared.readOnly && result.rows.length > maxRows;
      const rows = truncated ? result.rows.slice(0, maxRows) : result.rows;
      return {
        rows,
        rowCount: prepared.readOnly ? rows.length : result.rowCount || 0,
        executionTimeMs: Math.round(performance.now() - started),
        columns: result.fields?.map((field) => field.name) || [],
        queryId,
        truncated,
      };
    } finally {
      if (backendPid && this.activeQueries.get(queryId)?.backendPid === backendPid) this.activeQueries.delete(queryId);
    }
  }

  public async cancelSql(scope: Scope, queryId: string): Promise<boolean> {
    const active = this.activeQueries.get(queryId);
    if (!active || active.scopeKey !== this.scopeKey(scope)) return false;
    const rows = await postgres.query<{ cancelled: boolean }>('SELECT pg_cancel_backend($1) AS cancelled', [active.backendPid]);
    return rows[0]?.cancelled === true;
  }

  public async explainSql(scope: Scope, sql: string, analyze = false, options: { queryId?: string; timeoutMs?: number } = {}): Promise<{ queryId: string; executionTimeMs: number; analyze: boolean; plan: unknown }> {
    const prepared = prepareScopedSql(sql);
    if (!prepared.readOnly) throw new Error('EXPLAIN is limited to read-only SELECT/VALUES queries in the scoped editor.');
    const schema = await this.schema(scope);
    const queryId = options.queryId && /^[A-Za-z0-9_-]{8,80}$/.test(options.queryId) ? options.queryId : `qry_${crypto.randomUUID().replace(/-/g, '')}`;
    const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || 10_000, 500), 30_000);
    const started = performance.now();
    let backendPid: number | undefined;
    try {
      const result = await postgres.transaction(async (client) => {
        const pid = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        backendPid = Number(pid.rows[0]?.pid || 0);
        if (backendPid) this.activeQueries.set(queryId, { backendPid, scopeKey: this.scopeKey(scope) });
        await client.query('SET LOCAL TRANSACTION READ ONLY');
        await client.query(`SET LOCAL statement_timeout = '${timeoutMs}ms'`);
        await client.query(`SET LOCAL search_path TO ${quote(schema)}, pg_catalog`);
        return client.query(`EXPLAIN (${analyze ? 'ANALYZE, BUFFERS, ' : ''}FORMAT JSON) ${prepared.sql}`);
      });
      return { queryId, executionTimeMs: Math.round(performance.now() - started), analyze, plan: result.rows[0]?.['QUERY PLAN'] ?? result.rows };
    } finally {
      if (backendPid && this.activeQueries.get(queryId)?.backendPid === backendPid) this.activeQueries.delete(queryId);
    }
  }

  public async getMigrations(scope: Scope): Promise<any[]> {
    const schema = await this.schema(scope); await this.internalTables(schema);
    return postgres.query<any>(`SELECT id,version,name,sql_up AS "sqlUp",sql_down AS "sqlDown",applied_at AS "appliedAt",execution_time_ms AS "executionTimeMs",status,checksum,rolled_back_at AS "rolledBackAt" FROM ${quote(schema)}."__brisabase_migrations" ORDER BY applied_at DESC`);
  }

  public async createMigration(scope: Scope, name: string, sqlUp?: string, sqlDown?: string): Promise<any> {
    if (!identifier.test(name.replaceAll('-', '_'))) throw new Error('Invalid migration name.');
    const schema = await this.schema(scope); await this.internalTables(schema);
    const preparedUp = sqlUp ? prepareScopedSql(sqlUp) : null;
    if (sqlDown) prepareScopedSql(sqlDown);
    const id = `mig_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`; const version = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const started = performance.now();
    if (preparedUp) {
      await postgres.transaction(async (client) => {
        if (preparedUp.readOnly) await client.query('SET LOCAL TRANSACTION READ ONLY');
        await client.query("SET LOCAL statement_timeout = '10000ms'");
        await client.query("SET LOCAL lock_timeout = '3000ms'");
        await client.query(`SET LOCAL search_path TO ${quote(schema)}, pg_catalog`);
        await client.query(preparedUp.sql);
      });
    }
    const record = { id, version, name, sqlUp, sqlDown, appliedAt: new Date().toISOString(), executionTimeMs: Math.round(performance.now() - started), status: 'success', checksum: crypto.createHash('sha256').update(sqlUp || '').digest('hex') };
    await postgres.execute(`INSERT INTO ${quote(schema)}."__brisabase_migrations"(id,version,name,sql_up,sql_down,applied_at,execution_time_ms,status,checksum) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [record.id,record.version,record.name,record.sqlUp || null,record.sqlDown || null,record.appliedAt,record.executionTimeMs,record.status,record.checksum]);
    return record;
  }

  public async rollbackMigration(scope: Scope, migrationId: string): Promise<any> {
    const schema = await this.schema(scope);
    await this.internalTables(schema);
    const rows = await postgres.query<any>(`SELECT id,version,name,sql_up AS "sqlUp",sql_down AS "sqlDown",status,checksum FROM ${quote(schema)}."__brisabase_migrations" WHERE id=$1`, [migrationId]);
    const migration = rows[0];
    if (!migration) throw new Error('Migration not found.');
    if (migration.status !== 'success') throw new Error('Only an applied migration can be rolled back.');
    if (!migration.sqlDown) throw new Error('This migration does not define sqlDown and cannot be rolled back automatically.');
    const latest = (await postgres.query<{ id: string }>(`SELECT id FROM ${quote(schema)}."__brisabase_migrations" WHERE status='success' ORDER BY applied_at DESC LIMIT 1`))[0];
    if (latest?.id !== migrationId) throw new Error('Only the most recently applied successful migration can be rolled back automatically.');
    const expectedChecksum = crypto.createHash('sha256').update(migration.sqlUp || '').digest('hex');
    if (migration.checksum && migration.checksum !== expectedChecksum) throw new Error('Migration checksum mismatch. Rollback was blocked.');
    const prepared = prepareScopedSql(migration.sqlDown);
    const started = performance.now();
    await postgres.transaction(async (client) => {
      if (prepared.readOnly) await client.query('SET LOCAL TRANSACTION READ ONLY');
      await client.query("SET LOCAL statement_timeout = '30000ms'");
      await client.query("SET LOCAL lock_timeout = '3000ms'");
      await client.query(`SET LOCAL search_path TO ${quote(schema)}, pg_catalog`);
      await client.query(prepared.sql);
      await client.query(`UPDATE ${quote(schema)}."__brisabase_migrations" SET status='rolled_back',rolled_back_at=now(),execution_time_ms=$2 WHERE id=$1`, [migrationId, Math.round(performance.now() - started)]);
    });
    return (await this.getMigrations(scope)).find((item) => item.id === migrationId);
  }

  public async getFunctions(scope: Scope): Promise<any[]> {
    const schema = await this.schema(scope);
    return postgres.query<any>(`SELECT p.oid::text AS id,p.proname AS name,'public' AS schema,pg_get_function_arguments(p.oid) AS arguments,pg_get_function_result(p.oid) AS "returnType",l.lanname AS language,p.prosrc AS definition,now() AS "createdAt" FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname=$1 ORDER BY p.proname`, [schema]);
  }

  public async createFunction(scope: Scope, input: { name: string; arguments?: string; returnType?: string; language?: 'plpgsql' | 'sql'; definition: string }): Promise<any> {
    if (!identifier.test(input.name) || !input.definition || !['plpgsql', 'sql'].includes(input.language || 'plpgsql')) throw new Error('Invalid PostgreSQL function definition.');
    const schema = await this.schema(scope); const returnType = input.returnType || 'trigger';
    if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\[\])?(?:\s+[A-Za-z_][A-Za-z0-9_]*)?$/.test(returnType)) throw new Error('Unsupported function return type.');
    if (input.definition.includes('$brisabase$') || (input.arguments && !/^(?:\s*|\s*[A-Za-z_][A-Za-z0-9_]*\s+[A-Za-z_][A-Za-z0-9_]*(?:\[\])?(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*\s+[A-Za-z_][A-Za-z0-9_]*(?:\[\])?)*\s*)$/.test(input.arguments))) throw new Error('Unsupported PostgreSQL function arguments or body delimiter.');
    const definition = validateScopedFunctionBody(input.definition);
    await postgres.execute(`CREATE OR REPLACE FUNCTION ${quote(schema)}.${quote(input.name)}(${input.arguments || ''}) RETURNS ${returnType} LANGUAGE ${input.language || 'plpgsql'} SET search_path TO ${quote(schema)}, pg_catalog AS $brisabase$${definition}$brisabase$`);
    return (await this.getFunctions(scope)).find((item) => item.name === input.name) || null;
  }

  public async getTriggers(scope: Scope): Promise<any[]> {
    const schema = await this.schema(scope);
    return postgres.query<any>(`SELECT t.oid::text AS id,t.tgname AS name,c.relname AS "tableName",CASE WHEN (t.tgtype & 2) = 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,CASE WHEN (t.tgtype & 4) = 4 THEN 'INSERT' WHEN (t.tgtype & 8) = 8 THEN 'DELETE' ELSE 'UPDATE' END AS event,p.proname AS "functionName",t.tgenabled <> 'D' AS enabled,now() AS "createdAt" FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname=$1 AND NOT t.tgisinternal ORDER BY t.tgname`, [schema]);
  }

  public async createTrigger(scope: Scope, input: { name: string; tableName: string; event: 'INSERT' | 'UPDATE' | 'DELETE'; timing: 'BEFORE' | 'AFTER'; functionName: string }): Promise<any> {
    if (!identifier.test(input.name) || !identifier.test(input.tableName) || !identifier.test(input.functionName) || !['INSERT', 'UPDATE', 'DELETE'].includes(input.event) || !['BEFORE', 'AFTER'].includes(input.timing)) throw new Error('Invalid PostgreSQL trigger definition.');
    const schema = await this.schema(scope);
    await postgres.execute(`CREATE TRIGGER ${quote(input.name)} ${input.timing} ${input.event} ON ${quote(schema)}.${quote(input.tableName)} FOR EACH ROW EXECUTE FUNCTION ${quote(schema)}.${quote(input.functionName)}()`);
    return (await this.getTriggers(scope)).find((item) => item.name === input.name) || null;
  }
}

export const realProjectDatabase = new RealProjectDatabase();
