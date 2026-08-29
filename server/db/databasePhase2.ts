import { postgres } from './postgres';
import { realProjectDatabase } from './realProjectDatabase';
import { ColumnDef, TableDef } from './projectDatabase';
import { prepareScopedSql } from './scopedSql';

type Scope = { organizationId: string; projectId: string; environmentId: string };

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PHYSICAL_TYPE: Record<ColumnDef['type'], string> = {
  uuid: 'uuid',
  text: 'text',
  varchar: 'varchar(255)',
  char: 'char(1)',
  integer: 'integer',
  bigint: 'bigint',
  numeric: 'numeric',
  decimal: 'decimal',
  real: 'real',
  'double precision': 'double precision',
  boolean: 'boolean',
  date: 'date',
  timestamp: 'timestamp',
  timestamptz: 'timestamptz',
  json: 'json',
  jsonb: 'jsonb',
};

function quote(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`Invalid PostgreSQL identifier: ${name}`);
  return `"${name}"`;
}

function safeDefault(value?: string | null): string | null {
  if (value === undefined || value === null || value.trim() === '') return null;
  const normalized = value.trim();
  if (/^(?:now\(\)|current_timestamp|gen_random_uuid\(\)|true|false|null|-?\d+(?:\.\d+)?|'(?:''|[^'])*')$/i.test(normalized)) return normalized;
  throw new Error('Unsupported column default expression. Use a literal, now(), current_timestamp, or gen_random_uuid().');
}

function assertColumnType(type: ColumnDef['type']): string {
  const physical = PHYSICAL_TYPE[type];
  if (!physical) throw new Error(`Unsupported PostgreSQL column type '${String(type)}'.`);
  return physical;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function encodeCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return [columns.map(csvCell).join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\n');
}

export function parseCsv(input: string): Record<string, string>[] {
  const source = String(input || '').replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { value += '"'; index += 1; continue; }
      if (char === '"') { quoted = false; continue; }
      value += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ',') { row.push(value); value = ''; continue; }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(value); value = '';
      if (row.some((cell) => cell !== '')) records.push(row);
      row = [];
      continue;
    }
    value += char;
  }
  if (quoted) throw new Error('CSV has an unterminated quoted field.');
  if (value !== '' || row.length) { row.push(value); if (row.some((cell) => cell !== '')) records.push(row); }
  if (records.length < 1) return [];
  const headers = records[0].map((cell) => cell.trim());
  if (!headers.length || headers.some((header) => !IDENTIFIER.test(header))) throw new Error('CSV header contains an invalid column name.');
  if (new Set(headers).size !== headers.length) throw new Error('CSV header contains duplicate column names.');
  return records.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}

function coerceImportValue(value: unknown, column: ColumnDef): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (text === '' && column.isNullable) return null;
  if (column.type === 'boolean') {
    if (/^(?:true|1|yes|sim)$/i.test(text)) return true;
    if (/^(?:false|0|no|nao|não)$/i.test(text)) return false;
    throw new Error(`Invalid boolean value for '${column.name}'.`);
  }
  if (['integer', 'bigint', 'numeric', 'decimal', 'real', 'double precision'].includes(column.type)) {
    const number = Number(text);
    if (!Number.isFinite(number)) throw new Error(`Invalid numeric value for '${column.name}'.`);
    return number;
  }
  if (column.type === 'json' || column.type === 'jsonb') {
    try { return JSON.parse(text); } catch { throw new Error(`Invalid JSON value for '${column.name}'.`); }
  }
  return value;
}

function uniqueConstraintName(table: string, column: string): string {
  return `uq_${table}_${column}`.slice(0, 60);
}

export class DatabasePhase2Engine {
  public async alterTable(scope: Scope, tableName: string, input: { renameTo?: string }): Promise<TableDef> {
    const schema = await realProjectDatabase.getSchemaName(scope);
    const table = await realProjectDatabase.getTable(scope, tableName);
    if (!table) throw new Error(`Table '${tableName}' was not found.`);
    if (!input.renameTo || !IDENTIFIER.test(input.renameTo)) throw new Error('A valid new table name is required.');
    if (await realProjectDatabase.getTable(scope, input.renameTo)) throw new Error(`Table '${input.renameTo}' already exists.`);
    await postgres.execute(`ALTER TABLE ${quote(schema)}.${quote(tableName)} RENAME TO ${quote(input.renameTo)}`);
    return (await realProjectDatabase.getTable(scope, input.renameTo))!;
  }

  public async addColumn(scope: Scope, tableName: string, column: ColumnDef): Promise<TableDef> {
    const schema = await realProjectDatabase.getSchemaName(scope);
    const table = await realProjectDatabase.getTable(scope, tableName);
    if (!table) throw new Error(`Table '${tableName}' was not found.`);
    if (!IDENTIFIER.test(column.name)) throw new Error('A valid column name is required.');
    if (table.columns.some((item) => item.name === column.name)) throw new Error(`Column '${column.name}' already exists.`);
    if (column.isPrimaryKey) throw new Error('Adding a primary key through the visual column editor is not supported. Use a migration after validating existing rows.');
    const type = assertColumnType(column.type);
    const defaultValue = safeDefault(column.defaultValue);
    const parts = [`ALTER TABLE ${quote(schema)}.${quote(tableName)} ADD COLUMN ${quote(column.name)} ${type}`];
    if (defaultValue) parts.push(`DEFAULT ${defaultValue}`);
    if (column.isNullable === false) parts.push('NOT NULL');
    await postgres.execute(parts.join(' '));
    if (column.isUnique) await postgres.execute(`ALTER TABLE ${quote(schema)}.${quote(tableName)} ADD CONSTRAINT ${quote(uniqueConstraintName(tableName, column.name))} UNIQUE (${quote(column.name)})`);
    return (await realProjectDatabase.getTable(scope, tableName))!;
  }

  public async alterColumn(scope: Scope, tableName: string, columnName: string, input: Partial<ColumnDef> & { renameTo?: string }): Promise<TableDef> {
    const schema = await realProjectDatabase.getSchemaName(scope);
    const table = await realProjectDatabase.getTable(scope, tableName);
    if (!table) throw new Error(`Table '${tableName}' was not found.`);
    const current = table.columns.find((column) => column.name === columnName);
    if (!current) throw new Error(`Column '${columnName}' was not found.`);
    if (current.isPrimaryKey && (input.type || input.isNullable === true || input.renameTo)) throw new Error('Primary-key type/nullability/name changes require an explicit migration.');
    let activeName = columnName;
    await postgres.transaction(async (client) => {
      await client.query(`SET LOCAL search_path TO ${quote(schema)}, pg_catalog`);
      if (input.renameTo && input.renameTo !== columnName) {
        if (!IDENTIFIER.test(input.renameTo)) throw new Error('Invalid new column name.');
        if (table.columns.some((column) => column.name === input.renameTo)) throw new Error(`Column '${input.renameTo}' already exists.`);
        await client.query(`ALTER TABLE ${quote(schema)}.${quote(tableName)} RENAME COLUMN ${quote(columnName)} TO ${quote(input.renameTo)}`);
        activeName = input.renameTo;
      }
      if (input.type && input.type !== current.type) {
        const target = assertColumnType(input.type);
        await client.query(`ALTER TABLE ${quote(schema)}.${quote(tableName)} ALTER COLUMN ${quote(activeName)} TYPE ${target} USING ${quote(activeName)}::${target}`);
      }
      if (input.isNullable !== undefined && input.isNullable !== current.isNullable) {
        await client.query(`ALTER TABLE ${quote(schema)}.${quote(tableName)} ALTER COLUMN ${quote(activeName)} ${input.isNullable ? 'DROP' : 'SET'} NOT NULL`);
      }
      if (input.defaultValue !== undefined && input.defaultValue !== current.defaultValue) {
        const nextDefault = safeDefault(input.defaultValue);
        await client.query(`ALTER TABLE ${quote(schema)}.${quote(tableName)} ALTER COLUMN ${quote(activeName)} ${nextDefault ? `SET DEFAULT ${nextDefault}` : 'DROP DEFAULT'}`);
      }
      if (input.isUnique !== undefined && input.isUnique !== current.isUnique) {
        const constraint = uniqueConstraintName(tableName, activeName);
        if (input.isUnique) await client.query(`ALTER TABLE ${quote(schema)}.${quote(tableName)} ADD CONSTRAINT ${quote(constraint)} UNIQUE (${quote(activeName)})`);
        else {
          const rows = await client.query<{ constraint_name: string }>(`SELECT tc.constraint_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema WHERE tc.table_schema=$1 AND tc.table_name=$2 AND tc.constraint_type='UNIQUE' AND kcu.column_name=$3`, [schema, tableName, activeName]);
          for (const row of rows.rows) await client.query(`ALTER TABLE ${quote(schema)}.${quote(tableName)} DROP CONSTRAINT ${quote(row.constraint_name)}`);
        }
      }
    });
    return (await realProjectDatabase.getTable(scope, tableName))!;
  }

  public async dropColumn(scope: Scope, tableName: string, columnName: string, confirm: string): Promise<TableDef> {
    if (confirm !== `${tableName}.${columnName}`) throw new Error(`Type '${tableName}.${columnName}' to confirm this destructive operation.`);
    const schema = await realProjectDatabase.getSchemaName(scope);
    const table = await realProjectDatabase.getTable(scope, tableName);
    if (!table) throw new Error(`Table '${tableName}' was not found.`);
    const column = table.columns.find((item) => item.name === columnName);
    if (!column) throw new Error(`Column '${columnName}' was not found.`);
    if (column.isPrimaryKey) throw new Error('Primary-key columns cannot be dropped from the visual editor. Use a reviewed migration.');
    await postgres.execute(`ALTER TABLE ${quote(schema)}.${quote(tableName)} DROP COLUMN ${quote(columnName)} RESTRICT`);
    return (await realProjectDatabase.getTable(scope, tableName))!;
  }


  public async deleteRelationship(scope: Scope, constraintName: string, confirm: string): Promise<boolean> {
    if (confirm !== constraintName) throw new Error(`Type '${constraintName}' to confirm relationship deletion.`);
    const relationship = (await realProjectDatabase.getRelationships(scope)).find((item) => item.id === constraintName);
    if (!relationship) return false;
    const schema = await realProjectDatabase.getSchemaName(scope);
    await postgres.execute(`ALTER TABLE ${quote(schema)}.${quote(relationship.fromTable)} DROP CONSTRAINT ${quote(constraintName)} RESTRICT`);
    return true;
  }

  public async deleteIndex(scope: Scope, indexName: string, confirm: string): Promise<boolean> {
    if (confirm !== indexName) throw new Error(`Type '${indexName}' to confirm index deletion.`);
    if (!(await realProjectDatabase.getIndexes(scope)).some((item) => item.name === indexName)) return false;
    const schema = await realProjectDatabase.getSchemaName(scope);
    await postgres.execute(`DROP INDEX ${quote(schema)}.${quote(indexName)} RESTRICT`);
    return true;
  }

  public async deleteFunction(scope: Scope, functionName: string, confirm: string): Promise<boolean> {
    if (confirm !== functionName) throw new Error(`Type '${functionName}' to confirm function deletion.`);
    const fn = (await realProjectDatabase.getFunctions(scope)).find((item) => item.name === functionName);
    if (!fn) return false;
    if (fn.arguments && fn.arguments.trim()) throw new Error('Functions with arguments must be removed through a reviewed migration because the exact PostgreSQL signature is required.');
    const schema = await realProjectDatabase.getSchemaName(scope);
    await postgres.execute(`DROP FUNCTION ${quote(schema)}.${quote(functionName)}() RESTRICT`);
    return true;
  }

  public async deleteTrigger(scope: Scope, triggerName: string, confirm: string): Promise<boolean> {
    if (confirm !== triggerName) throw new Error(`Type '${triggerName}' to confirm trigger deletion.`);
    const trigger = (await realProjectDatabase.getTriggers(scope)).find((item) => item.name === triggerName);
    if (!trigger) return false;
    const schema = await realProjectDatabase.getSchemaName(scope);
    await postgres.execute(`DROP TRIGGER ${quote(triggerName)} ON ${quote(schema)}.${quote(trigger.tableName)} RESTRICT`);
    return true;
  }

  public async setTriggerEnabled(scope: Scope, triggerName: string, enabled: boolean): Promise<any> {
    const trigger = (await realProjectDatabase.getTriggers(scope)).find((item) => item.name === triggerName);
    if (!trigger) throw new Error('Trigger not found.');
    const schema = await realProjectDatabase.getSchemaName(scope);
    await postgres.execute(`ALTER TABLE ${quote(schema)}.${quote(trigger.tableName)} ${enabled ? 'ENABLE' : 'DISABLE'} TRIGGER ${quote(triggerName)}`);
    return (await realProjectDatabase.getTriggers(scope)).find((item) => item.name === triggerName);
  }

  public async listViews(scope: Scope): Promise<Array<{ name: string; definition: string }>> {
    const schema = await realProjectDatabase.getSchemaName(scope);
    return postgres.query(`SELECT viewname AS name, definition FROM pg_views WHERE schemaname=$1 ORDER BY viewname`, [schema]);
  }

  public async createView(scope: Scope, name: string, query: string, replace = false): Promise<{ name: string; definition: string }> {
    if (!IDENTIFIER.test(name)) throw new Error('A valid view name is required.');
    const prepared = prepareScopedSql(query);
    if (!prepared.readOnly) throw new Error('A view definition must be a read-only SELECT/VALUES query.');
    const schema = await realProjectDatabase.getSchemaName(scope);
    await postgres.transaction(async (client) => {
      await client.query(`SET LOCAL search_path TO ${quote(schema)}, pg_catalog`);
      await client.query(`CREATE ${replace ? 'OR REPLACE ' : ''}VIEW ${quote(schema)}.${quote(name)} AS ${prepared.sql}`);
    });
    return (await this.listViews(scope)).find((view) => view.name === name)!;
  }

  public async deleteView(scope: Scope, name: string, confirm: string): Promise<boolean> {
    if (confirm !== name) throw new Error(`Type '${name}' to confirm view deletion.`);
    const schema = await realProjectDatabase.getSchemaName(scope);
    const existing = (await this.listViews(scope)).some((view) => view.name === name);
    if (!existing) return false;
    await postgres.execute(`DROP VIEW ${quote(schema)}.${quote(name)} RESTRICT`);
    return true;
  }

  public async listMaterializedViews(scope: Scope): Promise<Array<{ name: string; definition: string; populated: boolean }>> {
    const schema = await realProjectDatabase.getSchemaName(scope);
    const rows = await postgres.query<any>(`SELECT matviewname AS name, definition, ispopulated AS populated FROM pg_matviews WHERE schemaname=$1 ORDER BY matviewname`, [schema]);
    return rows.map((row) => ({ name: row.name, definition: row.definition || '', populated: Boolean(row.populated) }));
  }

  public async createMaterializedView(scope: Scope, name: string, query: string, withData = true): Promise<{ name: string; definition: string; populated: boolean }> {
    if (!IDENTIFIER.test(name)) throw new Error('A valid materialized view name is required.');
    const prepared = prepareScopedSql(query);
    if (!prepared.readOnly) throw new Error('A materialized view definition must be a read-only SELECT/VALUES query.');
    const schema = await realProjectDatabase.getSchemaName(scope);
    await postgres.transaction(async (client) => {
      await client.query(`SET LOCAL search_path TO ${quote(schema)}, pg_catalog`);
      await client.query("SET LOCAL statement_timeout = '30000ms'");
      await client.query(`CREATE MATERIALIZED VIEW ${quote(schema)}.${quote(name)} AS ${prepared.sql} ${withData ? 'WITH DATA' : 'WITH NO DATA'}`);
    });
    return (await this.listMaterializedViews(scope)).find((view) => view.name === name)!;
  }

  public async refreshMaterializedView(scope: Scope, name: string): Promise<{ name: string; definition: string; populated: boolean }> {
    const schema = await realProjectDatabase.getSchemaName(scope);
    if (!(await this.listMaterializedViews(scope)).some((view) => view.name === name)) throw new Error('Materialized view not found.');
    await postgres.transaction(async (client) => {
      await client.query(`SET LOCAL search_path TO ${quote(schema)}, pg_catalog`);
      await client.query("SET LOCAL statement_timeout = '30000ms'");
      await client.query(`REFRESH MATERIALIZED VIEW ${quote(schema)}.${quote(name)}`);
    });
    return (await this.listMaterializedViews(scope)).find((view) => view.name === name)!;
  }

  public async deleteMaterializedView(scope: Scope, name: string, confirm: string): Promise<boolean> {
    if (confirm !== name) throw new Error(`Type '${name}' to confirm materialized view deletion.`);
    const schema = await realProjectDatabase.getSchemaName(scope);
    if (!(await this.listMaterializedViews(scope)).some((view) => view.name === name)) return false;
    await postgres.execute(`DROP MATERIALIZED VIEW ${quote(schema)}.${quote(name)} RESTRICT`);
    return true;
  }

  public async listEnums(scope: Scope): Promise<Array<{ name: string; values: string[] }>> {
    const schema = await realProjectDatabase.getSchemaName(scope);
    const rows = await postgres.query<{ name: string; value: string }>(`SELECT t.typname AS name, e.enumlabel AS value FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname=$1 ORDER BY t.typname,e.enumsortorder`, [schema]);
    const map = new Map<string, string[]>();
    for (const row of rows) map.set(row.name, [...(map.get(row.name) || []), row.value]);
    return [...map.entries()].map(([name, values]) => ({ name, values }));
  }

  public async createEnum(scope: Scope, name: string, values: string[]): Promise<{ name: string; values: string[] }> {
    if (!IDENTIFIER.test(name)) throw new Error('A valid enum name is required.');
    const cleaned = values.map((value) => String(value).trim()).filter(Boolean);
    if (!cleaned.length || new Set(cleaned).size !== cleaned.length || cleaned.some((value) => value.length > 120)) throw new Error('Enum values must be non-empty, unique strings up to 120 characters.');
    const schema = await realProjectDatabase.getSchemaName(scope);
    const escaped = cleaned.map((value) => `'${value.replaceAll("'", "''")}'`).join(', ');
    await postgres.execute(`CREATE TYPE ${quote(schema)}.${quote(name)} AS ENUM (${escaped})`);
    return { name, values: cleaned };
  }

  public async deleteEnum(scope: Scope, name: string, confirm: string): Promise<boolean> {
    if (confirm !== name) throw new Error(`Type '${name}' to confirm enum deletion.`);
    const schema = await realProjectDatabase.getSchemaName(scope);
    if (!(await this.listEnums(scope)).some((item) => item.name === name)) return false;
    await postgres.execute(`DROP TYPE ${quote(schema)}.${quote(name)} RESTRICT`);
    return true;
  }

  public async listSequences(scope: Scope): Promise<Array<{ name: string; startValue: number; minimumValue?: number; maximumValue?: number; increment: number; cycle: boolean }>> {
    const schema = await realProjectDatabase.getSchemaName(scope);
    const rows = await postgres.query<any>(`SELECT sequence_name AS name,start_value,minimum_value,maximum_value,increment,cycle_option FROM information_schema.sequences WHERE sequence_schema=$1 ORDER BY sequence_name`, [schema]);
    return rows.map((row) => ({ name: row.name, startValue: Number(row.start_value), minimumValue: Number(row.minimum_value), maximumValue: Number(row.maximum_value), increment: Number(row.increment), cycle: row.cycle_option === 'YES' }));
  }

  public async createSequence(scope: Scope, input: { name: string; startValue?: number; increment?: number; cycle?: boolean }): Promise<any> {
    if (!IDENTIFIER.test(input.name)) throw new Error('A valid sequence name is required.');
    const start = Number.isSafeInteger(input.startValue) ? Number(input.startValue) : 1;
    const increment = Number.isSafeInteger(input.increment) && input.increment !== 0 ? Number(input.increment) : 1;
    const schema = await realProjectDatabase.getSchemaName(scope);
    await postgres.execute(`CREATE SEQUENCE ${quote(schema)}.${quote(input.name)} START WITH ${start} INCREMENT BY ${increment} ${input.cycle ? 'CYCLE' : 'NO CYCLE'}`);
    return (await this.listSequences(scope)).find((item) => item.name === input.name)!;
  }

  public async deleteSequence(scope: Scope, name: string, confirm: string): Promise<boolean> {
    if (confirm !== name) throw new Error(`Type '${name}' to confirm sequence deletion.`);
    const schema = await realProjectDatabase.getSchemaName(scope);
    if (!(await this.listSequences(scope)).some((item) => item.name === name)) return false;
    await postgres.execute(`DROP SEQUENCE ${quote(schema)}.${quote(name)} RESTRICT`);
    return true;
  }

  public async listExtensions(): Promise<Array<{ name: string; installedVersion?: string; defaultVersion?: string; installed: boolean; description?: string }>> {
    const rows = await postgres.query<any>(`SELECT a.name,a.default_version,e.extversion AS installed_version,a.comment AS description FROM pg_available_extensions a LEFT JOIN pg_extension e ON e.extname=a.name WHERE a.name IN ('pgcrypto','uuid-ossp','citext','pg_trgm','btree_gin','btree_gist') ORDER BY a.name`);
    return rows.map((row) => ({ name: row.name, defaultVersion: row.default_version || undefined, installedVersion: row.installed_version || undefined, installed: Boolean(row.installed_version), description: row.description || undefined }));
  }

  public async exportRows(scope: Scope, tableName: string, format: 'csv' | 'json', limit = 10_000): Promise<{ content: string; contentType: string; filename: string; rowCount: number }> {
    const table = await realProjectDatabase.getTable(scope, tableName);
    if (!table) throw new Error(`Table '${tableName}' was not found.`);
    const result = await realProjectDatabase.getRows(scope, tableName, { limit: Math.min(Math.max(limit, 1), 10_000), offset: 0 });
    const content = format === 'json' ? JSON.stringify(result.rows, null, 2) : encodeCsv(result.rows, table.columns.map((column) => column.name));
    return { content, contentType: format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8', filename: `${tableName}.${format}`, rowCount: result.rows.length };
  }

  public async importRows(scope: Scope, tableName: string, input: { format: 'csv' | 'json'; content: string; mode?: 'append' | 'upsert' }): Promise<{ inserted: number; updated: number; total: number }> {
    const schema = await realProjectDatabase.getSchemaName(scope);
    const table = await realProjectDatabase.getTable(scope, tableName);
    if (!table) throw new Error(`Table '${tableName}' was not found.`);
    const rawRows = input.format === 'csv' ? parseCsv(input.content) : JSON.parse(String(input.content || '[]'));
    if (!Array.isArray(rawRows)) throw new Error('Import payload must contain an array of rows.');
    if (rawRows.length > 5000) throw new Error('A single import is limited to 5,000 rows. Split larger files into batches.');
    const allowed = new Set(table.columns.map((column) => column.name));
    const normalized = rawRows.map((raw, rowIndex) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Row ${rowIndex + 1} is not an object.`);
      const entries = Object.entries(raw).filter(([key]) => allowed.has(key));
      if (!entries.length) throw new Error(`Row ${rowIndex + 1} does not contain a known table column.`);
      return Object.fromEntries(entries.map(([key, value]) => [key, coerceImportValue(value, table.columns.find((column) => column.name === key)!)]));
    });
    const primary = table.columns.find((column) => column.isPrimaryKey)?.name;
    if (input.mode === 'upsert' && !primary) throw new Error('Upsert import requires a primary key.');
    let inserted = 0;
    let updated = 0;
    await postgres.transaction(async (client) => {
      await client.query(`SET LOCAL search_path TO ${quote(schema)}, pg_catalog`);
      await client.query("SET LOCAL statement_timeout = '30000ms'");
      for (const row of normalized) {
        const entries = Object.entries(row);
        const columns = entries.map(([key]) => quote(key));
        const values = entries.map(([, value]) => value);
        const placeholders = values.map((_, index) => `$${index + 1}`);
        let sql = `INSERT INTO ${quote(schema)}.${quote(tableName)} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
        if (input.mode === 'upsert' && primary) {
          const updates = entries.filter(([key]) => key !== primary).map(([key]) => `${quote(key)}=EXCLUDED.${quote(key)}`);
          sql += updates.length ? ` ON CONFLICT (${quote(primary)}) DO UPDATE SET ${updates.join(', ')}` : ` ON CONFLICT (${quote(primary)}) DO NOTHING`;
          sql += ' RETURNING (xmax = 0) AS inserted';
          const result = await client.query<{ inserted: boolean }>(sql, values);
          if (result.rows[0]?.inserted) inserted += 1; else updated += 1;
        } else {
          await client.query(sql, values);
          inserted += 1;
        }
      }
    });
    return { inserted, updated, total: normalized.length };
  }

  public async snapshot(scope: Scope): Promise<any> {
    const [tables, relationships, indexes, views, materializedViews, enums, sequences] = await Promise.all([
      realProjectDatabase.listTables(scope),
      realProjectDatabase.getRelationships(scope),
      realProjectDatabase.getIndexes(scope),
      this.listViews(scope),
      this.listMaterializedViews(scope),
      this.listEnums(scope),
      this.listSequences(scope),
    ]);
    return { generatedAt: new Date().toISOString(), tables, relationships, indexes, views, materializedViews, enums, sequences };
  }

  public async diff(scope: Scope, baseline: any): Promise<{ hasChanges: boolean; changes: Array<{ kind: string; object: string; detail: string }>; migrationSql: string[] }> {
    if (!baseline || !Array.isArray(baseline.tables)) throw new Error('A valid BrisaBase schema snapshot is required.');
    const current = await this.snapshot(scope);
    const changes: Array<{ kind: string; object: string; detail: string }> = [];
    const migrationSql: string[] = [];
    const oldTables = new Map<string, any>(baseline.tables.map((table: any) => [String(table.name), table]));
    const newTables = new Map<string, any>(current.tables.map((table: any) => [String(table.name), table]));
    for (const [name, table] of newTables) {
      if (!oldTables.has(name)) {
        changes.push({ kind: 'table.added', object: name, detail: 'Table exists in current schema but not in the baseline.' });
        const defs = (table as any).columns.map((column: ColumnDef) => `${quote(column.name)} ${assertColumnType(column.type)}${column.isNullable === false || column.isPrimaryKey ? ' NOT NULL' : ''}${column.isUnique && !column.isPrimaryKey ? ' UNIQUE' : ''}${column.defaultValue ? ` DEFAULT ${column.defaultValue}` : ''}`);
        const pks = (table as any).columns.filter((column: ColumnDef) => column.isPrimaryKey).map((column: ColumnDef) => quote(column.name));
        if (pks.length) defs.push(`PRIMARY KEY (${pks.join(', ')})`);
        migrationSql.push(`CREATE TABLE ${quote(name)} (${defs.join(', ')});`);
        continue;
      }
      const before: any = oldTables.get(name);
      const beforeColumns = new Map<string, any>((before.columns || []).map((column: any) => [String(column.name), column]));
      for (const column of (table as any).columns as ColumnDef[]) {
        const old: any = beforeColumns.get(column.name);
        if (!old) {
          changes.push({ kind: 'column.added', object: `${name}.${column.name}`, detail: `Added ${column.type} column.` });
          migrationSql.push(`ALTER TABLE ${quote(name)} ADD COLUMN ${quote(column.name)} ${assertColumnType(column.type)}${column.isNullable===false?' NOT NULL':''}${column.isUnique?' UNIQUE':''}${column.defaultValue?` DEFAULT ${column.defaultValue}`:''};`);
        } else if (old.type !== column.type || Boolean(old.isNullable) !== Boolean(column.isNullable) || Boolean(old.isUnique) !== Boolean(column.isUnique) || String(old.defaultValue || '') !== String(column.defaultValue || '')) {
          changes.push({ kind: 'column.changed', object: `${name}.${column.name}`, detail: `Column definition changed (${old.type} → ${column.type}).` });
        }
        beforeColumns.delete(column.name);
      }
      for (const [columnName] of beforeColumns) changes.push({ kind: 'column.removed', object: `${name}.${columnName}`, detail: 'Column exists in baseline but not current schema; destructive SQL is intentionally not generated.' });
      oldTables.delete(name);
    }
    for (const [name] of oldTables) changes.push({ kind: 'table.removed', object: name, detail: 'Table exists in baseline but not current schema; destructive SQL is intentionally not generated.' });

    const stable = (value: any): string => JSON.stringify(value);
    const compareNamed = (key: 'indexes'|'views'|'materializedViews'|'enums'|'sequences', identity: (item:any)=>string, normalize: (item:any)=>any, onAdded?: (item:any)=>string|undefined) => {
      const beforeItems = Array.isArray(baseline[key]) ? baseline[key] : [];
      const currentItems = Array.isArray(current[key]) ? current[key] : [];
      const beforeMap = new Map(beforeItems.map((item:any)=>[identity(item), item]));
      for (const item of currentItems) {
        const id = identity(item); const before = beforeMap.get(id);
        if (!before) { changes.push({kind:`${key}.added`,object:id,detail:`${key} object added.`}); const sql=onAdded?.(item); if(sql)migrationSql.push(sql); }
        else if (stable(normalize(before)) !== stable(normalize(item))) changes.push({kind:`${key}.changed`,object:id,detail:`${key} object definition changed.`});
        beforeMap.delete(id);
      }
      for (const [id] of beforeMap) changes.push({kind:`${key}.removed`,object:String(id),detail:`${key} object removed; destructive SQL is intentionally not generated.`});
    };
    compareNamed('indexes',(item)=>String(item.name),(item)=>({tableName:item.tableName,columns:item.columns,type:item.type,isUnique:Boolean(item.isUnique)}),(item)=>`CREATE ${item.isUnique?'UNIQUE ':''}INDEX ${quote(item.name)} ON ${quote(item.tableName)} USING ${String(item.type||'btree').toUpperCase()} (${(item.columns||[]).map((column:string)=>quote(column)).join(', ')});`);
    compareNamed('views',(item)=>String(item.name),(item)=>({definition:String(item.definition||'').trim()}),(item)=>`CREATE VIEW ${quote(item.name)} AS ${String(item.definition||'').trim()};`);
    compareNamed('materializedViews',(item)=>String(item.name),(item)=>({definition:String(item.definition||'').trim(),populated:Boolean(item.populated)}),(item)=>`CREATE MATERIALIZED VIEW ${quote(item.name)} AS ${String(item.definition||'').trim()} ${item.populated?'WITH DATA':'WITH NO DATA'};`);
    compareNamed('enums',(item)=>String(item.name),(item)=>({values:item.values||[]}),(item)=>`CREATE TYPE ${quote(item.name)} AS ENUM (${(item.values||[]).map((value:string)=>`'${String(value).replaceAll("'","''")}'`).join(', ')});`);
    compareNamed('sequences',(item)=>String(item.name),(item)=>({startValue:Number(item.startValue||1),increment:Number(item.increment||1),cycle:Boolean(item.cycle)}),(item)=>`CREATE SEQUENCE ${quote(item.name)} START WITH ${Number(item.startValue||1)} INCREMENT BY ${Number(item.increment||1)} ${item.cycle?'CYCLE':'NO CYCLE'};`);

    const relIdentity=(item:any)=>String(item.id||`${item.fromTable}.${item.fromColumn}->${item.toTable}.${item.toColumn}`);
    const beforeRelationships=new Map((Array.isArray(baseline.relationships)?baseline.relationships:[]).map((item:any)=>[relIdentity(item),item]));
    for(const item of current.relationships){const id=relIdentity(item);const before=beforeRelationships.get(id);const normalized=(value:any)=>({fromTable:value.fromTable,fromColumn:value.fromColumn,toTable:value.toTable,toColumn:value.toColumn,onDelete:value.onDelete||'NO ACTION',onUpdate:value.onUpdate||'NO ACTION'});if(!before){changes.push({kind:'relationships.added',object:id,detail:'Foreign-key relationship added.'});if(IDENTIFIER.test(id))migrationSql.push(`ALTER TABLE ${quote(item.fromTable)} ADD CONSTRAINT ${quote(id)} FOREIGN KEY (${quote(item.fromColumn)}) REFERENCES ${quote(item.toTable)} (${quote(item.toColumn)}) ON DELETE ${item.onDelete||'NO ACTION'} ON UPDATE ${item.onUpdate||'NO ACTION'};`);}else if(stable(normalized(before))!==stable(normalized(item)))changes.push({kind:'relationships.changed',object:id,detail:'Foreign-key relationship changed.'});beforeRelationships.delete(id);}
    for(const [id] of beforeRelationships)changes.push({kind:'relationships.removed',object:String(id),detail:'Foreign-key relationship removed; destructive SQL is intentionally not generated.'});
    return { hasChanges: changes.length > 0, changes, migrationSql };
  }
}

export const databasePhase2Engine = new DatabasePhase2Engine();
