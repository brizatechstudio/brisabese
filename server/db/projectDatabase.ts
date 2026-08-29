import { db } from './database';
import { SqlParser } from './sqlParser';
import { logger } from '../logger';
import { postgresCdc } from '../realtime/postgresCdc';
import { securityEngine } from '../security/securityEngine';
import { SecurityContext } from '../security/types';
import { observability } from '../observability';

export interface ColumnDef {
  name: string;
  type: 'uuid' | 'text' | 'varchar' | 'char' | 'integer' | 'bigint' | 'numeric' | 'decimal' | 'real' | 'double precision' | 'boolean' | 'date' | 'timestamp' | 'timestamptz' | 'json' | 'jsonb';
  isPrimaryKey?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
  defaultValue?: string;
}

export interface TableDef {
  name: string;
  schema?: string;
  rowCount: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  columns: ColumnDef[];
}

export interface DbSchemaDef {
  name: string;
  isSystem: boolean;
  tableCount: number;
  createdAt: string;
}

export interface DbIndexDef {
  id: string;
  name: string;
  tableName: string;
  columns: string[];
  type: 'btree' | 'hash' | 'gin' | 'gist' | 'brin';
  isUnique: boolean;
  sizeKb: number;
  createdAt: string;
}

export interface DbRelationshipDef {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION';
  onUpdate?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION';
}

export interface DbMigrationDef {
  id: string;
  version: string;
  name: string;
  sqlUp?: string;
  sqlDown?: string;
  appliedAt: string;
  executionTimeMs: number;
  status: 'success' | 'failed' | 'pending' | 'rolled_back';
  checksum?: string;
}

export interface DbFunctionDef {
  id: string;
  name: string;
  schema: string;
  arguments: string;
  returnType: string;
  language: 'plpgsql' | 'sql';
  definition: string;
  createdAt: string;
}

export interface DbTriggerDef {
  id: string;
  name: string;
  tableName: string;
  event: string;
  timing: 'BEFORE' | 'AFTER' | 'INSTEAD OF';
  functionName: string;
  enabled: boolean;
  createdAt: string;
}

export interface SqlQueryHistoryItem {
  id: string;
  query: string;
  executionTimeMs: number;
  rowCount: number;
  status: 'success' | 'error';
  executedAt: string;
  errorMessage?: string;
}

interface ProjectDatabaseStore {
  key: string; // orgId:projId:envId
  status: 'connected' | 'connecting' | 'disconnected' | 'error' | 'maintenance';
  version: string;
  schemas: DbSchemaDef[];
  tables: Map<string, TableDef>;
  rows: Map<string, any[]>; // tableName -> row array
  relationships: DbRelationshipDef[];
  indexes: DbIndexDef[];
  migrations: DbMigrationDef[];
  functions: DbFunctionDef[];
  triggers: DbTriggerDef[];
  queryHistory: SqlQueryHistoryItem[];
}

export class ProjectDatabaseManager {
  private stores = new Map<string, ProjectDatabaseStore>();

  private getStoreKey(orgId: string, projId: string, envId: string): string {
    return `${orgId}:${projId}:${envId}`;
  }

  public getOrCreateStore(orgId: string, projId: string, envId: string): ProjectDatabaseStore {
    const key = this.getStoreKey(orgId, projId, envId);
    if (this.stores.has(key)) {
      return this.stores.get(key)!;
    }

    // Initialize new isolated store for this project & environment
    const store: ProjectDatabaseStore = {
      key,
      status: 'connected',
      version: 'PostgreSQL 16.2 (Ubuntu 16.2-1.pgdg22.04+1)',
      schemas: [
        { name: 'public', isSystem: false, tableCount: 3, createdAt: new Date().toISOString() },
        { name: 'auth', isSystem: true, tableCount: 2, createdAt: new Date().toISOString() },
        { name: 'storage', isSystem: true, tableCount: 2, createdAt: new Date().toISOString() }
      ],
      tables: new Map(),
      rows: new Map(),
      relationships: [],
      indexes: [],
      migrations: [],
      functions: [],
      triggers: [],
      queryHistory: []
    };

    // Seed default tables for the project environment
    const now = new Date().toISOString();

    // Table 1: users
    const usersTable: TableDef = {
      name: 'users',
      schema: 'public',
      rowCount: 3,
      sizeBytes: 24576,
      createdAt: now,
      updatedAt: now,
      columns: [
        { name: 'id', type: 'uuid', isPrimaryKey: true, isNullable: false, defaultValue: 'gen_random_uuid()' },
        { name: 'name', type: 'text', isNullable: false },
        { name: 'email', type: 'text', isNullable: false, isUnique: true },
        { name: 'role', type: 'varchar', isNullable: false, defaultValue: "'user'" },
        { name: 'active', type: 'boolean', isNullable: false, defaultValue: 'true' },
        { name: 'created_at', type: 'timestamp', isNullable: false, defaultValue: 'now()' }
      ]
    };

    const usersRows = [
      { id: 'usr_001', name: 'Ana Beatriz', email: 'ana@empresa.com', role: 'admin', active: true, created_at: '2026-08-01 10:00:00' },
      { id: 'usr_002', name: 'Carlos Eduardo', email: 'carlos@empresa.com', role: 'developer', active: true, created_at: '2026-08-02 11:30:00' },
      { id: 'usr_003', name: 'Juliana Lima', email: 'juliana@empresa.com', role: 'user', active: false, created_at: '2026-08-03 14:15:00' }
    ];

    // Table 2: products
    const productsTable: TableDef = {
      name: 'products',
      schema: 'public',
      rowCount: 3,
      sizeBytes: 16384,
      createdAt: now,
      updatedAt: now,
      columns: [
        { name: 'id', type: 'uuid', isPrimaryKey: true, isNullable: false, defaultValue: 'gen_random_uuid()' },
        { name: 'name', type: 'text', isNullable: false },
        { name: 'price', type: 'numeric', isNullable: false },
        { name: 'stock', type: 'integer', isNullable: false, defaultValue: '0' },
        { name: 'created_at', type: 'timestamp', isNullable: false, defaultValue: 'now()' }
      ]
    };

    const productsRows = [
      { id: 'prod_101', name: 'Subscrição PRO Mensal', price: 99.90, stock: 9999, created_at: '2026-08-01 09:00:00' },
      { id: 'prod_102', name: 'Plano Enterprise Anual', price: 2990.00, stock: 500, created_at: '2026-08-01 09:30:00' },
      { id: 'prod_103', name: 'Add-on Banco Dedicado', price: 499.00, stock: 100, created_at: '2026-08-02 12:00:00' }
    ];

    // Table 3: orders
    const ordersTable: TableDef = {
      name: 'orders',
      schema: 'public',
      rowCount: 2,
      sizeBytes: 12288,
      createdAt: now,
      updatedAt: now,
      columns: [
        { name: 'id', type: 'uuid', isPrimaryKey: true, isNullable: false, defaultValue: 'gen_random_uuid()' },
        { name: 'user_id', type: 'uuid', isNullable: false },
        { name: 'total_amount', type: 'numeric', isNullable: false },
        { name: 'status', type: 'varchar', isNullable: false, defaultValue: "'pending'" },
        { name: 'created_at', type: 'timestamp', isNullable: false, defaultValue: 'now()' }
      ]
    };

    const ordersRows = [
      { id: 'ord_501', user_id: 'usr_001', total_amount: 99.90, status: 'completed', created_at: '2026-08-03 08:20:00' },
      { id: 'ord_502', user_id: 'usr_002', total_amount: 2990.00, status: 'processing', created_at: '2026-08-04 09:10:00' }
    ];

    store.tables.set('users', usersTable);
    store.tables.set('products', productsTable);
    store.tables.set('orders', ordersTable);

    store.rows.set('users', usersRows);
    store.rows.set('products', productsRows);
    store.rows.set('orders', ordersRows);

    // Initial Foreign Keys
    store.relationships.push({
      id: 'rel_orders_user_id',
      fromTable: 'orders',
      fromColumn: 'user_id',
      toTable: 'users',
      toColumn: 'id',
      type: 'one-to-many',
      onDelete: 'CASCADE'
    });

    // Initial Indexes
    store.indexes.push(
      {
        id: 'idx_users_email',
        name: 'users_email_unique_idx',
        tableName: 'users',
        columns: ['email'],
        type: 'btree',
        isUnique: true,
        sizeKb: 16,
        createdAt: now
      },
      {
        id: 'idx_orders_user_id',
        name: 'orders_user_id_idx',
        tableName: 'orders',
        columns: ['user_id'],
        type: 'btree',
        isUnique: false,
        sizeKb: 8,
        createdAt: now
      }
    );

    // Initial Migrations
    store.migrations.push(
      {
        id: 'mig_001',
        version: '20260801_001',
        name: '001_initial_schema.sql',
        appliedAt: '2026-08-01 08:00:00',
        executionTimeMs: 42,
        status: 'success'
      },
      {
        id: 'mig_002',
        version: '20260802_002',
        name: '002_add_orders_status_index.sql',
        appliedAt: '2026-08-02 09:15:00',
        executionTimeMs: 18,
        status: 'success'
      }
    );

    // Initial Functions & Triggers
    store.functions.push({
      id: 'fn_update_timestamp',
      name: 'update_updated_at_column',
      schema: 'public',
      arguments: '',
      returnType: 'trigger',
      language: 'plpgsql',
      definition: 'BEGIN\n  NEW.updated_at = NOW();\n  RETURN NEW;\nEND;',
      createdAt: now
    });

    store.triggers.push({
      id: 'trig_users_updated_at',
      name: 'users_update_timestamp_trig',
      tableName: 'users',
      event: 'UPDATE',
      timing: 'BEFORE',
      functionName: 'update_updated_at_column',
      enabled: true,
      createdAt: now
    });

    this.stores.set(key, store);
    return store;
  }

  /** Internal backup representation; it never exposes a store reference to callers. */
  public exportBackupState(orgId: string, projId: string, envId: string): Record<string, unknown> {
    const store = this.getOrCreateStore(orgId, projId, envId);
    return JSON.parse(JSON.stringify({ status: store.status, version: store.version, schemas: store.schemas, tables: Array.from(store.tables.entries()), rows: Array.from(store.rows.entries()), relationships: store.relationships, indexes: store.indexes, migrations: store.migrations, functions: store.functions, triggers: store.triggers, queryHistory: store.queryHistory }));
  }

  public restoreBackupState(orgId: string, projId: string, envId: string, state: any, options: { tableName?: string } = {}): void {
    const store = this.getOrCreateStore(orgId, projId, envId);
    if (!state || !Array.isArray(state.tables) || !Array.isArray(state.rows)) throw new Error('Invalid database backup state.');
    if (options.tableName) {
      const tableName = options.tableName.toLowerCase();
      const table = state.tables.find(([name]: [string, any]) => name === tableName);
      const rows = state.rows.find(([name]: [string, any]) => name === tableName);
      if (!table || !rows) throw new Error(`Table '${tableName}' is not present in the backup.`);
      store.tables.set(tableName, JSON.parse(JSON.stringify(table[1])));
      store.rows.set(tableName, JSON.parse(JSON.stringify(rows[1])));
      return;
    }
    store.status = state.status || 'connected'; store.version = state.version || store.version;
    store.schemas = JSON.parse(JSON.stringify(state.schemas || []));
    store.tables = new Map(JSON.parse(JSON.stringify(state.tables)));
    store.rows = new Map(JSON.parse(JSON.stringify(state.rows)));
    store.relationships = JSON.parse(JSON.stringify(state.relationships || []));
    store.indexes = JSON.parse(JSON.stringify(state.indexes || []));
    store.migrations = JSON.parse(JSON.stringify(state.migrations || []));
    store.functions = JSON.parse(JSON.stringify(state.functions || []));
    store.triggers = JSON.parse(JSON.stringify(state.triggers || []));
    store.queryHistory = JSON.parse(JSON.stringify(state.queryHistory || []));
  }

  // OVERVIEW
  public getOverview(orgId: string, projId: string, envId: string) {
    const store = this.getOrCreateStore(orgId, projId, envId);
    let totalRows = 0;
    let totalSizeBytes = 0;

    store.tables.forEach((tbl) => {
      totalRows += tbl.rowCount;
      totalSizeBytes += tbl.sizeBytes;
    });

    return {
      status: store.status,
      version: store.version,
      sizeMb: Math.round((totalSizeBytes / (1024 * 1024)) * 100) / 100 || 0.05,
      tableCount: store.tables.size,
      schemaCount: store.schemas.length,
      activeConnections: 12,
      maxConnections: 100,
      totalRows
    };
  }

  // SCHEMAS
  public getSchemas(orgId: string, projId: string, envId: string): DbSchemaDef[] {
    const store = this.getOrCreateStore(orgId, projId, envId);
    return [...store.schemas];
  }

  public createSchema(orgId: string, projId: string, envId: string, name: string): DbSchemaDef {
    const store = this.getOrCreateStore(orgId, projId, envId);
    if (store.schemas.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Schema '${name}' já existe.`);
    }
    const newSchema: DbSchemaDef = {
      name,
      isSystem: false,
      tableCount: 0,
      createdAt: new Date().toISOString()
    };
    store.schemas.push(newSchema);

    db.logAudit({
      organization_id: orgId,
      project_id: projId,
      environment_id: envId,
      user_id: 'usr_owner_1',
      action: 'schema.created',
      resource_type: 'schema',
      resource_id: name,
      metadata: { name }
    });

    return newSchema;
  }

  public deleteSchema(orgId: string, projId: string, envId: string, name: string): boolean {
    const store = this.getOrCreateStore(orgId, projId, envId);
    const schema = store.schemas.find(s => s.name === name);
    if (!schema) return false;
    if (schema.isSystem || name === 'public') {
      throw new Error(`Não é permitido excluir o schema protegido '${name}'.`);
    }
    store.schemas = store.schemas.filter(s => s.name !== name);

    db.logAudit({
      organization_id: orgId,
      project_id: projId,
      environment_id: envId,
      user_id: 'usr_owner_1',
      action: 'schema.deleted',
      resource_type: 'schema',
      resource_id: name,
      metadata: { name }
    });

    return true;
  }

  // TABLES
  public listTables(orgId: string, projId: string, envId: string): TableDef[] {
    const store = this.getOrCreateStore(orgId, projId, envId);
    return Array.from(store.tables.values());
  }

  public getTableSchema(orgId: string, projId: string, envId: string, tableName: string): TableDef | null {
    const store = this.getOrCreateStore(orgId, projId, envId);
    return store.tables.get(tableName) || null;
  }

  public createTable(orgId: string, projId: string, envId: string, tableData: { name: string; schema?: string; columns: ColumnDef[] }): TableDef {
    const store = this.getOrCreateStore(orgId, projId, envId);
    const tableName = tableData.name.toLowerCase().trim();

    if (store.tables.has(tableName)) {
      throw new Error(`Tabela '${tableName}' já existe.`);
    }

    const now = new Date().toISOString();
    // Ensure primary key exists
    let cols = [...tableData.columns];
    if (!cols.some(c => c.isPrimaryKey)) {
      cols.unshift({
        name: 'id',
        type: 'uuid',
        isPrimaryKey: true,
        isNullable: false,
        defaultValue: 'gen_random_uuid()'
      });
    }

    const newTable: TableDef = {
      name: tableName,
      schema: tableData.schema || 'public',
      rowCount: 0,
      sizeBytes: 8192,
      createdAt: now,
      updatedAt: now,
      columns: cols
    };

    store.tables.set(tableName, newTable);
    store.rows.set(tableName, []);

    // Generate automatic DDL migration
    const colDefsSql = cols.map(c => `  ${c.name} ${c.type}${c.isPrimaryKey ? ' PRIMARY KEY' : ''}${!c.isNullable ? ' NOT NULL' : ''}${c.defaultValue ? ` DEFAULT ${c.defaultValue}` : ''}`).join(',\n');
    const sqlUp = `CREATE TABLE ${tableName} (\n${colDefsSql}\n);`;

    this.createMigration(orgId, projId, envId, `create_table_${tableName}`, sqlUp, `DROP TABLE ${tableName};`);

    db.logAudit({
      organization_id: orgId,
      project_id: projId,
      environment_id: envId,
      user_id: 'usr_owner_1',
      action: 'table.created',
      resource_type: 'table',
      resource_id: tableName,
      metadata: { name: tableName, columnsCount: cols.length }
    });

    return newTable;
  }

  public deleteTable(orgId: string, projId: string, envId: string, tableName: string): boolean {
    const store = this.getOrCreateStore(orgId, projId, envId);
    if (!store.tables.has(tableName)) return false;

    store.tables.delete(tableName);
    store.rows.delete(tableName);
    store.relationships = store.relationships.filter(r => r.fromTable !== tableName && r.toTable !== tableName);
    store.indexes = store.indexes.filter(i => i.tableName !== tableName);

    db.logAudit({
      organization_id: orgId,
      project_id: projId,
      environment_id: envId,
      user_id: 'usr_owner_1',
      action: 'table.deleted',
      resource_type: 'table',
      resource_id: tableName,
      metadata: { name: tableName }
    });

    return true;
  }

  // ROWS
  public getTableRows(
    orgId: string,
    projId: string,
    envId: string,
    tableName: string,
    options?: { limit?: number; offset?: number; search?: string; sortField?: string; sortOrder?: 'asc' | 'desc' }
  ): { rows: any[]; totalCount: number } {
    const store = this.getOrCreateStore(orgId, projId, envId);
    const allRows = store.rows.get(tableName) || [];

    let filtered = [...allRows];

    // Search filter
    if (options?.search) {
      const q = options.search.toLowerCase();
      filtered = filtered.filter(row =>
        Object.values(row).some(val => val !== null && val !== undefined && String(val).toLowerCase().includes(q))
      );
    }

    // Sort
    if (options?.sortField) {
      const sf = options.sortField;
      const order = options.sortOrder === 'desc' ? -1 : 1;
      filtered.sort((a, b) => {
        if (a[sf] < b[sf]) return -1 * order;
        if (a[sf] > b[sf]) return 1 * order;
        return 0;
      });
    }

    const totalCount = filtered.length;
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    const paginated = filtered.slice(offset, offset + limit);

    return { rows: paginated, totalCount };
  }

  /** Returns a copy of a row for authorization checks without exposing the backing store. */
  public getRow(orgId: string, projId: string, envId: string, tableName: string, rowId: string): Record<string, any> | null {
    const store = this.getOrCreateStore(orgId, projId, envId);
    const table = store.tables.get(tableName);
    if (!table) return null;
    const primaryKey = table.columns.find((column) => column.isPrimaryKey)?.name || 'id';
    const row = (store.rows.get(tableName) || []).find((candidate) => String(candidate[primaryKey]) === String(rowId));
    return row ? { ...row } : null;
  }

  public insertRow(orgId: string, projId: string, envId: string, tableName: string, rowData: any, requestId?: string): any {
    const store = this.getOrCreateStore(orgId, projId, envId);
    const table = store.tables.get(tableName);
    if (!table) throw new Error(`Tabela '${tableName}' não encontrada.`);

    const rows = store.rows.get(tableName) || [];
    const pkCol = table.columns.find(c => c.isPrimaryKey)?.name || 'id';

    const newId = rowData[pkCol] || `id_${Math.random().toString(36).substring(2, 9)}`;
    const newRow = {
      ...rowData,
      [pkCol]: newId,
      created_at: rowData.created_at || new Date().toISOString().replace('T', ' ').substring(0, 19)
    };

    rows.unshift(newRow);
    table.rowCount = rows.length;
    table.updatedAt = new Date().toISOString();

    db.logAudit({
      organization_id: orgId,
      project_id: projId,
      environment_id: envId,
      user_id: 'usr_owner_1',
      action: 'row.inserted',
      resource_type: 'row',
      resource_id: newId,
      metadata: { tableName, rowId: newId }
    });

    // Emit Realtime CDC event
    postgresCdc.emitChange({
      organizationId: orgId,
      projectId: projId,
      environmentId: envId,
      schema: table.schema || 'public',
      table: tableName,
      operation: 'INSERT',
      new: { ...newRow },
      requestId,
    });

    return newRow;
  }

  public updateRow(orgId: string, projId: string, envId: string, tableName: string, rowId: string, rowData: any, requestId?: string): any {
    const store = this.getOrCreateStore(orgId, projId, envId);
    const table = store.tables.get(tableName);
    if (!table) throw new Error(`Tabela '${tableName}' não encontrada.`);

    const rows = store.rows.get(tableName) || [];
    const pkCol = table.columns.find(c => c.isPrimaryKey)?.name || 'id';

    const idx = rows.findIndex(r => String(r[pkCol]) === String(rowId));
    if (idx === -1) throw new Error(`Registro com ID '${rowId}' não encontrado.`);

    const oldRow = { ...rows[idx] };
    rows[idx] = { ...oldRow, ...rowData, updated_at: new Date().toISOString() };
    table.updatedAt = new Date().toISOString();

    db.logAudit({
      organization_id: orgId,
      project_id: projId,
      environment_id: envId,
      user_id: 'usr_owner_1',
      action: 'row.updated',
      resource_type: 'row',
      resource_id: rowId,
      metadata: { tableName, rowId }
    });

    // Emit Realtime CDC event
    postgresCdc.emitChange({
      organizationId: orgId,
      projectId: projId,
      environmentId: envId,
      schema: table.schema || 'public',
      table: tableName,
      operation: 'UPDATE',
      new: { ...rows[idx] },
      old: oldRow,
      requestId,
    });

    return rows[idx];
  }

  public deleteRow(orgId: string, projId: string, envId: string, tableName: string, rowId: string, requestId?: string): boolean {
    const store = this.getOrCreateStore(orgId, projId, envId);
    const table = store.tables.get(tableName);
    if (!table) return false;

    const rows = store.rows.get(tableName) || [];
    const pkCol = table.columns.find(c => c.isPrimaryKey)?.name || 'id';

    const updatedRows = rows.filter(r => String(r[pkCol]) !== String(rowId));
    if (updatedRows.length === rows.length) return false;

    store.rows.set(tableName, updatedRows);
    table.rowCount = updatedRows.length;

    db.logAudit({
      organization_id: orgId,
      project_id: projId,
      environment_id: envId,
      user_id: 'usr_owner_1',
      action: 'row.deleted',
      resource_type: 'row',
      resource_id: rowId,
      metadata: { tableName, rowId }
    });

    // Emit Realtime CDC event
    const deletedRow = rows.find(r => String(r[pkCol]) === String(rowId));
    postgresCdc.emitChange({
      organizationId: orgId,
      projectId: projId,
      environmentId: envId,
      schema: table.schema || 'public',
      table: tableName,
      operation: 'DELETE',
      old: deletedRow ? { ...deletedRow } : null,
      requestId,
    });

    return true;
  }

  // SQL EXECUTION
  public executeQuery(orgId: string, projId: string, envId: string, sqlQuery: string, userId: string = 'usr_owner_1', securityContext?: SecurityContext) {
    const store = this.getOrCreateStore(orgId, projId, envId);
    const startTime = performance.now();
    const traceSpan = observability.traces.startSpan('database.query', 'database', { operation: sqlQuery.trim().split(/\s+/)[0]?.toLowerCase() || 'unknown' }, { organizationId: orgId, projectId: projId, environmentId: envId, userId, requestId: securityContext?.requestId, service: 'database' });

    const validation = SqlParser.validate(sqlQuery);
    if (!validation.safe && !validation.requiresConfirmation) {
      const errItem: SqlQueryHistoryItem = {
        id: `q_${Date.now()}`,
        query: sqlQuery,
        executionTimeMs: 0,
        rowCount: 0,
        status: 'error',
        executedAt: new Date().toISOString(),
        errorMessage: validation.warning
      };
      store.queryHistory.unshift(errItem);
      observability.traces.endSpan(traceSpan, validation.warning || 'Unsafe SQL query.');
      throw new Error(validation.warning || 'Instrução SQL rejeitada por segurança.');
    }

    const trimmed = sqlQuery.trim().toLowerCase();

    try {
      let rows: any[] = [];
      let columns: string[] = [];

      if (trimmed.startsWith('select')) {
        let matchedTable = 'users';
        store.tables.forEach((t) => {
          if (trimmed.includes(t.name)) {
            matchedTable = t.name;
          }
        });
        const tableRows = store.rows.get(matchedTable) || [];
        rows = securityContext ? securityEngine.filterRows(securityContext, matchedTable, tableRows) : [...tableRows];
        columns = rows.length > 0 ? Object.keys(rows[0]) : ['id', 'name', 'email', 'created_at'];
      } else {
        rows = [{ message: 'Comando SQL executado com sucesso.', query: sqlQuery }];
        columns = ['message', 'query'];
      }

      const endTime = performance.now();
      const executionTimeMs = Math.round((endTime - startTime + Math.random() * 5) * 100) / 100;

      const historyItem: SqlQueryHistoryItem = {
        id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        query: sqlQuery,
        executionTimeMs,
        rowCount: rows.length,
        status: 'success',
        executedAt: new Date().toISOString()
      };
      store.queryHistory.unshift(historyItem);

      db.logAudit({
        organization_id: orgId,
        project_id: projId,
        environment_id: envId,
        user_id: userId,
        action: 'query.executed',
        resource_type: 'sql_query',
        metadata: { querySnippet: sqlQuery.substring(0, 100), durationMs: executionTimeMs }
      });
      observability.metric('database.queries', 1, 'counter', { operation: trimmed.startsWith('select') ? 'select' : 'mutation' }, { organizationId: orgId, projectId: projId, environmentId: envId, userId, requestId: securityContext?.requestId, service: 'database' });
      observability.metric('database.query_latency_ms', executionTimeMs, 'histogram', {}, { organizationId: orgId, projectId: projId, environmentId: envId, userId, requestId: securityContext?.requestId, service: 'database' });
      observability.traces.endSpan(traceSpan);
      if (executionTimeMs > 100) observability.log(executionTimeMs > 1000 ? 'warning' : 'info', 'database.slow_query', 'Slow database query detected.', { durationMs: executionTimeMs, operation: trimmed.split(/\s+/)[0] }, { organizationId: orgId, projectId: projId, environmentId: envId, userId, requestId: securityContext?.requestId, service: 'database' });

      return {
        rows,
        rowCount: rows.length,
        executionTimeMs,
        columns
      };
    } catch (err: any) {
      if (traceSpan.status === 'running') observability.traces.endSpan(traceSpan, err);
      observability.metric('database.query_errors', 1, 'counter', {}, { organizationId: orgId, projectId: projId, environmentId: envId, userId, requestId: securityContext?.requestId, service: 'database' });
      const historyItem: SqlQueryHistoryItem = {
        id: `q_${Date.now()}`,
        query: sqlQuery,
        executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
        rowCount: 0,
        status: 'error',
        executedAt: new Date().toISOString(),
        errorMessage: err.message
      };
      store.queryHistory.unshift(historyItem);
      throw err;
    }
  }

  public getSqlHistory(orgId: string, projId: string, envId: string): SqlQueryHistoryItem[] {
    const store = this.getOrCreateStore(orgId, projId, envId);
    return [...store.queryHistory];
  }

  // RELATIONSHIPS
  public getRelationships(orgId: string, projId: string, envId: string): DbRelationshipDef[] {
    const store = this.getOrCreateStore(orgId, projId, envId);
    return [...store.relationships];
  }

  public createRelationship(orgId: string, projId: string, envId: string, relData: Omit<DbRelationshipDef, 'id'>): DbRelationshipDef {
    const store = this.getOrCreateStore(orgId, projId, envId);
    const newRel: DbRelationshipDef = {
      id: `rel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      ...relData
    };
    store.relationships.push(newRel);

    db.logAudit({
      organization_id: orgId,
      project_id: projId,
      environment_id: envId,
      user_id: 'usr_owner_1',
      action: 'relationship.created',
      resource_type: 'relationship',
      resource_id: newRel.id,
      metadata: { fromTable: relData.fromTable, toTable: relData.toTable }
    });

    return newRel;
  }

  // INDEXES
  public getIndexes(orgId: string, projId: string, envId: string): DbIndexDef[] {
    const store = this.getOrCreateStore(orgId, projId, envId);
    return [...store.indexes];
  }

  public createIndex(orgId: string, projId: string, envId: string, idxData: Omit<DbIndexDef, 'id' | 'sizeKb' | 'createdAt'>): DbIndexDef {
    const store = this.getOrCreateStore(orgId, projId, envId);
    const newIdx: DbIndexDef = {
      id: `idx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      ...idxData,
      sizeKb: 16,
      createdAt: new Date().toISOString()
    };
    store.indexes.push(newIdx);

    db.logAudit({
      organization_id: orgId,
      project_id: projId,
      environment_id: envId,
      user_id: 'usr_owner_1',
      action: 'index.created',
      resource_type: 'index',
      resource_id: newIdx.name,
      metadata: { name: newIdx.name, tableName: newIdx.tableName }
    });

    return newIdx;
  }

  // MIGRATIONS
  public getMigrations(orgId: string, projId: string, envId: string): DbMigrationDef[] {
    const store = this.getOrCreateStore(orgId, projId, envId);
    return [...store.migrations];
  }

  public createMigration(orgId: string, projId: string, envId: string, name: string, sqlUp?: string, sqlDown?: string): DbMigrationDef {
    const store = this.getOrCreateStore(orgId, projId, envId);
    const now = new Date();
    const version = now.toISOString().replace(/[^0-9]/g, '').substring(0, 14);

    const newMig: DbMigrationDef = {
      id: `mig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      version: `${version}_${name}`,
      name,
      sqlUp,
      sqlDown,
      appliedAt: now.toISOString().replace('T', ' ').substring(0, 19),
      executionTimeMs: Math.floor(Math.random() * 20) + 10,
      status: 'success'
    };
    store.migrations.unshift(newMig);

    db.logAudit({
      organization_id: orgId,
      project_id: projId,
      environment_id: envId,
      user_id: 'usr_owner_1',
      action: 'migration.applied',
      resource_type: 'migration',
      resource_id: newMig.version,
      metadata: { version: newMig.version, name }
    });

    return newMig;
  }

  // FUNCTIONS
  public getFunctions(orgId: string, projId: string, envId: string): DbFunctionDef[] {
    const store = this.getOrCreateStore(orgId, projId, envId);
    return [...store.functions];
  }

  public createFunction(orgId: string, projId: string, envId: string, fnData: Omit<DbFunctionDef, 'id' | 'createdAt'>): DbFunctionDef {
    const store = this.getOrCreateStore(orgId, projId, envId);
    const newFn: DbFunctionDef = {
      id: `fn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      ...fnData,
      createdAt: new Date().toISOString()
    };
    store.functions.push(newFn);

    db.logAudit({
      organization_id: orgId,
      project_id: projId,
      environment_id: envId,
      user_id: 'usr_owner_1',
      action: 'function.created',
      resource_type: 'function',
      resource_id: newFn.name,
      metadata: { name: newFn.name }
    });

    return newFn;
  }

  // TRIGGERS
  public getTriggers(orgId: string, projId: string, envId: string): DbTriggerDef[] {
    const store = this.getOrCreateStore(orgId, projId, envId);
    return [...store.triggers];
  }

  public createTrigger(orgId: string, projId: string, envId: string, trigData: Omit<DbTriggerDef, 'id' | 'createdAt'>): DbTriggerDef {
    const store = this.getOrCreateStore(orgId, projId, envId);
    const newTrig: DbTriggerDef = {
      id: `trig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      ...trigData,
      createdAt: new Date().toISOString()
    };
    store.triggers.push(newTrig);

    db.logAudit({
      organization_id: orgId,
      project_id: projId,
      environment_id: envId,
      user_id: 'usr_owner_1',
      action: 'trigger.created',
      resource_type: 'trigger',
      resource_id: newTrig.name,
      metadata: { name: newTrig.name, tableName: newTrig.tableName }
    });

    return newTrig;
  }
}

export const projectDbManager = new ProjectDatabaseManager();
