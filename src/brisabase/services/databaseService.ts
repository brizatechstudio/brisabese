import {
  TableSchema,
  TableRow,
  DbRelationship,
  DbMigration,
  DbSchema,
  DbIndex,
  DbFunction,
  DbTrigger,
  SqlQueryHistory,
  DatabaseOverview,
  ColumnDefinition,
  DbView, DbMaterializedView, DbEnum, DbSequence, DbExtension, SqlSavedQuery, SqlExplainResult, SqlMetrics, DatabaseSchemaSnapshot, DatabaseSchemaDiff, DatabaseRowFilter, DatabaseRowSort
} from '../types';
import { MOCK_TABLES, MOCK_TABLE_ROWS, MOCK_RELATIONSHIPS, MOCK_MIGRATIONS } from '../mocks/mockDatabase';

export interface ExecuteQueryResult {
  rows: any[];
  rowCount: number;
  executionTimeMs: number;
  columns: string[];
  queryId: string;
  truncated: boolean;
}

export interface DatabaseService {
  getOverview(orgId?: string, projId?: string, envId?: string): Promise<DatabaseOverview>;
  listSchemas(orgId?: string, projId?: string, envId?: string): Promise<DbSchema[]>;
  createSchema(name: string, orgId?: string, projId?: string, envId?: string): Promise<DbSchema>;
  deleteSchema(name: string, orgId?: string, projId?: string, envId?: string): Promise<void>;
  listTables(orgId?: string, projId?: string, envId?: string): Promise<TableSchema[]>;
  getTableSchema(tableName: string, orgId?: string, projId?: string, envId?: string): Promise<TableSchema | null>;
  createTable(table: { name: string; schema?: string; columns: ColumnDefinition[] }, orgId?: string, projId?: string, envId?: string): Promise<TableSchema>;
  deleteTable(tableName: string, orgId?: string, projId?: string, envId?: string): Promise<void>;
  getTableRows(
    tableName: string,
    options?: { limit?: number; offset?: number; search?: string; sortField?: string; sortOrder?: 'asc' | 'desc'; filters?: DatabaseRowFilter[]; orFilters?: DatabaseRowFilter[]; sorts?: DatabaseRowSort[] },
    orgId?: string,
    projId?: string,
    envId?: string
  ): Promise<{ rows: TableRow[]; totalCount: number }>;
  insertRow(tableName: string, rowData: Omit<TableRow, 'id'>, orgId?: string, projId?: string, envId?: string): Promise<TableRow>;
  updateRow(tableName: string, rowId: string, rowData: Partial<TableRow>, orgId?: string, projId?: string, envId?: string): Promise<TableRow>;
  deleteRow(tableName: string, rowId: string, orgId?: string, projId?: string, envId?: string): Promise<void>;
  executeQuery(sqlQuery: string, orgId?: string, projId?: string, envId?: string, options?: { queryId?: string; timeoutMs?: number; maxRows?: number }): Promise<ExecuteQueryResult>;
  getSqlHistory(orgId?: string, projId?: string, envId?: string): Promise<SqlQueryHistory[]>;
  getSqlMetrics(orgId?: string, projId?: string, envId?: string): Promise<SqlMetrics>;
  getRelationships(orgId?: string, projId?: string, envId?: string): Promise<DbRelationship[]>;
  createRelationship(rel: Omit<DbRelationship, 'id'>, orgId?: string, projId?: string, envId?: string): Promise<DbRelationship>;
  getIndexes(orgId?: string, projId?: string, envId?: string): Promise<DbIndex[]>;
  createIndex(index: Omit<DbIndex, 'id' | 'sizeKb'>, orgId?: string, projId?: string, envId?: string): Promise<DbIndex>;
  getMigrations(orgId?: string, projId?: string, envId?: string): Promise<DbMigration[]>;
  createMigration(name: string, sqlUp?: string, sqlDown?: string, orgId?: string, projId?: string, envId?: string): Promise<DbMigration>;
  getFunctions(orgId?: string, projId?: string, envId?: string): Promise<DbFunction[]>;
  createFunction(fn: Omit<DbFunction, 'id' | 'createdAt'>, orgId?: string, projId?: string, envId?: string): Promise<DbFunction>;
  getTriggers(orgId?: string, projId?: string, envId?: string): Promise<DbTrigger[]>;
  createTrigger(trig: Omit<DbTrigger, 'id' | 'createdAt'>, orgId?: string, projId?: string, envId?: string): Promise<DbTrigger>;
  renameTable(tableName: string, renameTo: string, orgId?: string, projId?: string, envId?: string): Promise<TableSchema>;
  addColumn(tableName: string, column: ColumnDefinition, orgId?: string, projId?: string, envId?: string): Promise<TableSchema>;
  alterColumn(tableName: string, columnName: string, updates: Partial<ColumnDefinition> & { renameTo?: string }, orgId?: string, projId?: string, envId?: string): Promise<TableSchema>;
  deleteColumn(tableName: string, columnName: string, orgId?: string, projId?: string, envId?: string): Promise<TableSchema>;
  exportRows(tableName: string, format: 'csv' | 'json', orgId?: string, projId?: string, envId?: string): Promise<{ content: string; filename: string; rowCount: number }>;
  importRows(tableName: string, format: 'csv' | 'json', content: string, mode: 'append' | 'upsert', orgId?: string, projId?: string, envId?: string): Promise<{ inserted: number; updated: number; total: number }>;
  explainQuery(sqlQuery: string, analyze: boolean, options?: { queryId?: string; timeoutMs?: number }, orgId?: string, projId?: string, envId?: string): Promise<SqlExplainResult>;
  cancelQuery(queryId: string, orgId?: string, projId?: string, envId?: string): Promise<boolean>;
  listSavedQueries(orgId?: string, projId?: string, envId?: string): Promise<SqlSavedQuery[]>;
  saveQuery(name: string, query: string, favorite?: boolean, orgId?: string, projId?: string, envId?: string): Promise<SqlSavedQuery>;
  updateSavedQuery(id: string, updates: Partial<Pick<SqlSavedQuery, 'name' | 'query' | 'favorite'>>, orgId?: string, projId?: string, envId?: string): Promise<SqlSavedQuery>;
  deleteSavedQuery(id: string, orgId?: string, projId?: string, envId?: string): Promise<void>;
  deleteRelationship(id: string, orgId?: string, projId?: string, envId?: string): Promise<void>;
  deleteIndex(id: string, orgId?: string, projId?: string, envId?: string): Promise<void>;
  rollbackMigration(id: string, orgId?: string, projId?: string, envId?: string): Promise<DbMigration>;
  deleteFunction(name: string, orgId?: string, projId?: string, envId?: string): Promise<void>;
  setTriggerEnabled(name: string, enabled: boolean, orgId?: string, projId?: string, envId?: string): Promise<DbTrigger>;
  deleteTrigger(name: string, orgId?: string, projId?: string, envId?: string): Promise<void>;
  getViews(orgId?: string, projId?: string, envId?: string): Promise<DbView[]>;
  createView(name: string, query: string, replace?: boolean, orgId?: string, projId?: string, envId?: string): Promise<DbView>;
  deleteView(name: string, orgId?: string, projId?: string, envId?: string): Promise<void>;
  getMaterializedViews(orgId?: string, projId?: string, envId?: string): Promise<DbMaterializedView[]>;
  createMaterializedView(name: string, query: string, withData?: boolean, orgId?: string, projId?: string, envId?: string): Promise<DbMaterializedView>;
  refreshMaterializedView(name: string, orgId?: string, projId?: string, envId?: string): Promise<DbMaterializedView>;
  deleteMaterializedView(name: string, orgId?: string, projId?: string, envId?: string): Promise<void>;
  getEnums(orgId?: string, projId?: string, envId?: string): Promise<DbEnum[]>;
  createEnum(name: string, values: string[], orgId?: string, projId?: string, envId?: string): Promise<DbEnum>;
  deleteEnum(name: string, orgId?: string, projId?: string, envId?: string): Promise<void>;
  getSequences(orgId?: string, projId?: string, envId?: string): Promise<DbSequence[]>;
  createSequence(input: { name: string; startValue?: number; increment?: number; cycle?: boolean }, orgId?: string, projId?: string, envId?: string): Promise<DbSequence>;
  deleteSequence(name: string, orgId?: string, projId?: string, envId?: string): Promise<void>;
  getExtensions(orgId?: string, projId?: string, envId?: string): Promise<DbExtension[]>;
  getSchemaSnapshot(orgId?: string, projId?: string, envId?: string): Promise<DatabaseSchemaSnapshot>;
  diffSchema(baseline: DatabaseSchemaSnapshot, orgId?: string, projId?: string, envId?: string): Promise<DatabaseSchemaDiff>;
}

export class MockDatabaseService implements DatabaseService {
  private tables: TableSchema[] = [...MOCK_TABLES];
  private tableRows: Record<string, TableRow[]> = JSON.parse(JSON.stringify(MOCK_TABLE_ROWS));
  private relationships: DbRelationship[] = [...MOCK_RELATIONSHIPS];
  private migrations: DbMigration[] = [...MOCK_MIGRATIONS];
  private schemas: DbSchema[] = [
    { name: 'public', isSystem: false, tableCount: 3, createdAt: new Date().toISOString() },
    { name: 'auth', isSystem: true, tableCount: 2, createdAt: new Date().toISOString() },
    { name: 'storage', isSystem: true, tableCount: 2, createdAt: new Date().toISOString() }
  ];
  private indexes: DbIndex[] = [
    { id: 'idx_users_email', name: 'users_email_idx', tableName: 'users', columns: ['email'], type: 'btree', isUnique: true, sizeKb: 16 },
    { id: 'idx_orders_user_id', name: 'orders_user_id_idx', tableName: 'orders', columns: ['user_id'], type: 'btree', isUnique: false, sizeKb: 8 }
  ];
  private functions: DbFunction[] = [
    {
      id: 'fn_1',
      name: 'update_updated_at_column',
      schema: 'public',
      arguments: '',
      returnType: 'trigger',
      language: 'plpgsql',
      definition: 'BEGIN\n  NEW.updated_at = NOW();\n  RETURN NEW;\nEND;',
      createdAt: new Date().toISOString()
    }
  ];
  private triggers: DbTrigger[] = [
    {
      id: 'trig_1',
      name: 'users_updated_at_trig',
      tableName: 'users',
      event: 'UPDATE',
      timing: 'BEFORE',
      functionName: 'update_updated_at_column',
      enabled: true,
      createdAt: new Date().toISOString()
    }
  ];
  private sqlHistory: SqlQueryHistory[] = [
    {
      id: 'q_1',
      query: 'SELECT * FROM users ORDER BY created_at DESC;',
      executionTimeMs: 12,
      rowCount: 3,
      status: 'success',
      executedAt: new Date().toISOString()
    }
  ];

  async getOverview(_orgId?: string, _projId?: string, _envId?: string): Promise<DatabaseOverview> {
    return {
      status: 'connected',
      version: 'PostgreSQL 16.2 (Mock Engine)',
      sizeMb: 1.25,
      tableCount: this.tables.length,
      schemaCount: this.schemas.length,
      activeConnections: 8,
      maxConnections: 100,
      totalRows: Object.values(this.tableRows).reduce((acc, curr) => acc + curr.length, 0)
    };
  }

  async listSchemas(_orgId?: string, _projId?: string, _envId?: string): Promise<DbSchema[]> {
    return [...this.schemas];
  }

  async createSchema(name: string, _orgId?: string, _projId?: string, _envId?: string): Promise<DbSchema> {
    const newSchema: DbSchema = { name, isSystem: false, tableCount: 0, createdAt: new Date().toISOString() };
    this.schemas.push(newSchema);
    return newSchema;
  }

  async deleteSchema(name: string, _orgId?: string, _projId?: string, _envId?: string): Promise<void> {
    this.schemas = this.schemas.filter((s) => s.name !== name);
  }

  async listTables(_orgId?: string, _projId?: string, _envId?: string): Promise<TableSchema[]> {
    return [...this.tables];
  }

  async getTableSchema(tableName: string, _orgId?: string, _projId?: string, _envId?: string): Promise<TableSchema | null> {
    const table = this.tables.find((t) => t.name === tableName);
    return table ? { ...table } : null;
  }

  async createTable(table: { name: string; schema?: string; columns: ColumnDefinition[] }, _orgId?: string, _projId?: string, _envId?: string): Promise<TableSchema> {
    const newTable: TableSchema = {
      name: table.name,
      schema: table.schema || 'public',
      rowCount: 0,
      sizeBytes: 8192,
      columns: table.columns
    };
    this.tables.push(newTable);
    this.tableRows[table.name] = [];
    return newTable;
  }

  async deleteTable(tableName: string, _orgId?: string, _projId?: string, _envId?: string): Promise<void> {
    this.tables = this.tables.filter((t) => t.name !== tableName);
    delete this.tableRows[tableName];
  }

  async getTableRows(
    tableName: string,
    options?: { limit?: number; offset?: number; search?: string; sortField?: string; sortOrder?: 'asc' | 'desc'; filters?: DatabaseRowFilter[]; orFilters?: DatabaseRowFilter[]; sorts?: DatabaseRowSort[] },
    _orgId?: string,
    _projId?: string,
    _envId?: string
  ): Promise<{ rows: TableRow[]; totalCount: number }> {
    let rows = this.tableRows[tableName] ? [...this.tableRows[tableName]] : [];
    if (options?.search) {
      const q = options.search.toLowerCase();
      rows = rows.filter((r) => Object.values(r).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q)));
    }
    const totalCount = rows.length;
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    return { rows: rows.slice(offset, offset + limit), totalCount };
  }

  async insertRow(tableName: string, rowData: Omit<TableRow, 'id'>, _orgId?: string, _projId?: string, _envId?: string): Promise<TableRow> {
    if (!this.tableRows[tableName]) this.tableRows[tableName] = [];
    const newId = `row_${Math.random().toString(36).substring(2, 9)}`;
    const newRow: TableRow = { id: newId, ...rowData, created_at: new Date().toISOString().replace('T', ' ').substring(0, 19) };
    this.tableRows[tableName].unshift(newRow);
    const tIndex = this.tables.findIndex((t) => t.name === tableName);
    if (tIndex !== -1) this.tables[tIndex].rowCount += 1;
    return newRow;
  }

  async updateRow(tableName: string, rowId: string, rowData: Partial<TableRow>, _orgId?: string, _projId?: string, _envId?: string): Promise<TableRow> {
    const rows = this.tableRows[tableName];
    if (!rows) throw new Error(`Tabela ${tableName} não encontrada.`);
    const index = rows.findIndex((r) => String(r.id) === String(rowId));
    if (index === -1) throw new Error(`Registro ${rowId} não encontrado.`);
    rows[index] = { ...rows[index], ...rowData };
    return rows[index];
  }

  async deleteRow(tableName: string, rowId: string, _orgId?: string, _projId?: string, _envId?: string): Promise<void> {
    if (!this.tableRows[tableName]) return;
    this.tableRows[tableName] = this.tableRows[tableName].filter((r) => String(r.id) !== String(rowId));
    const tIndex = this.tables.findIndex((t) => t.name === tableName);
    if (tIndex !== -1 && this.tables[tIndex].rowCount > 0) this.tables[tIndex].rowCount -= 1;
  }

  async executeQuery(sqlQuery: string, _orgId?: string, _projId?: string, _envId?: string, _options?: { queryId?: string; timeoutMs?: number; maxRows?: number }): Promise<ExecuteQueryResult> {
    const trimmed = sqlQuery.trim().toLowerCase();
    const startTime = performance.now();
    if (trimmed.startsWith('select')) {
      let targetTable = 'users';
      for (const t of this.tables) {
        if (trimmed.includes(t.name)) { targetTable = t.name; break; }
      }
      const rows = this.tableRows[targetTable] || [];
      const cols = rows.length > 0 ? Object.keys(rows[0]) : ['id', 'name', 'email', 'created_at'];
      const endTime = performance.now();
      return { rows, rowCount: rows.length, executionTimeMs: Math.round((endTime - startTime + Math.random() * 8) * 100) / 100, columns: cols, queryId: `mock_${Date.now()}`, truncated: false };
    }
    const endTime = performance.now();
    return { rows: [{ message: 'Comando SQL executado com sucesso.', query: sqlQuery }], rowCount: 1, executionTimeMs: Math.round((endTime - startTime + Math.random() * 15) * 100) / 100, columns: ['message', 'query'], queryId: `mock_${Date.now()}`, truncated: false };
  }

  async getSqlHistory(_orgId?: string, _projId?: string, _envId?: string): Promise<SqlQueryHistory[]> { return [...this.sqlHistory]; }
  async getSqlMetrics(): Promise<SqlMetrics> { const total=this.sqlHistory.length; const success=this.sqlHistory.filter((item)=>item.status==='success'); const sorted=success.map((item)=>item.executionTimeMs).sort((a,b)=>a-b); const p95=sorted.length?sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*0.95)-1))]:0; return {total,successCount:success.length,errorCount:total-success.length,avgExecutionTimeMs:success.length?Math.round(success.reduce((sum,item)=>sum+item.executionTimeMs,0)/success.length):0,p95ExecutionTimeMs:p95,avgRowCount:success.length?Math.round((success.reduce((sum,item)=>sum+item.rowCount,0)/success.length)*100)/100:0,last24hCount:total}; }
  async getRelationships(_orgId?: string, _projId?: string, _envId?: string): Promise<DbRelationship[]> { return [...this.relationships]; }
  async createRelationship(rel: Omit<DbRelationship, 'id'>, _orgId?: string, _projId?: string, _envId?: string): Promise<DbRelationship> {
    const newRel: DbRelationship = { id: `rel_${Date.now()}`, ...rel }; this.relationships.push(newRel); return newRel;
  }
  async getIndexes(_orgId?: string, _projId?: string, _envId?: string): Promise<DbIndex[]> { return [...this.indexes]; }
  async createIndex(index: Omit<DbIndex, 'id' | 'sizeKb'>, _orgId?: string, _projId?: string, _envId?: string): Promise<DbIndex> {
    const newIdx: DbIndex = { id: `idx_${Date.now()}`, ...index, sizeKb: 16 }; this.indexes.push(newIdx); return newIdx;
  }
  async getMigrations(_orgId?: string, _projId?: string, _envId?: string): Promise<DbMigration[]> { return [...this.migrations]; }
  async createMigration(name: string, sqlUp?: string, sqlDown?: string, _orgId?: string, _projId?: string, _envId?: string): Promise<DbMigration> {
    const now = new Date();
    const newMig: DbMigration = { id: `mig_${Date.now()}`, version: `${now.toISOString().replace(/[^0-9]/g, '').substring(0, 12)}_${name}`, name, sqlUp, sqlDown, appliedAt: now.toISOString().replace('T', ' ').substring(0, 19), executionTimeMs: 24, status: 'success' };
    this.migrations.unshift(newMig); return newMig;
  }
  async getFunctions(_orgId?: string, _projId?: string, _envId?: string): Promise<DbFunction[]> { return [...this.functions]; }
  async createFunction(fn: Omit<DbFunction, 'id' | 'createdAt'>, _orgId?: string, _projId?: string, _envId?: string): Promise<DbFunction> {
    const newFn: DbFunction = { id: `fn_${Date.now()}`, ...fn, createdAt: new Date().toISOString() }; this.functions.push(newFn); return newFn;
  }
  async getTriggers(_orgId?: string, _projId?: string, _envId?: string): Promise<DbTrigger[]> { return [...this.triggers]; }
  async createTrigger(trig: Omit<DbTrigger, 'id' | 'createdAt'>, _orgId?: string, _projId?: string, _envId?: string): Promise<DbTrigger> {
    const newTrig: DbTrigger = { id: `trig_${Date.now()}`, ...trig, createdAt: new Date().toISOString() }; this.triggers.push(newTrig); return newTrig;
  }
  async renameTable(tableName: string, renameTo: string): Promise<TableSchema> { const table=this.tables.find(t=>t.name===tableName); if(!table) throw new Error('Tabela não encontrada.'); table.name=renameTo; this.tableRows[renameTo]=this.tableRows[tableName]||[]; delete this.tableRows[tableName]; return table; }
  async addColumn(tableName: string, column: ColumnDefinition): Promise<TableSchema> { const table=this.tables.find(t=>t.name===tableName); if(!table) throw new Error('Tabela não encontrada.'); table.columns.push(column); return table; }
  async alterColumn(tableName: string, columnName: string, updates: Partial<ColumnDefinition> & { renameTo?: string }): Promise<TableSchema> { const table=this.tables.find(t=>t.name===tableName); if(!table) throw new Error('Tabela não encontrada.'); const col=table.columns.find(c=>c.name===columnName); if(!col) throw new Error('Coluna não encontrada.'); Object.assign(col, updates); if(updates.renameTo) col.name=updates.renameTo; return table; }
  async deleteColumn(tableName: string, columnName: string): Promise<TableSchema> { const table=this.tables.find(t=>t.name===tableName); if(!table) throw new Error('Tabela não encontrada.'); table.columns=table.columns.filter(c=>c.name!==columnName); return table; }
  async exportRows(tableName: string, format: 'csv' | 'json'): Promise<{ content: string; filename: string; rowCount: number }> { const rows=this.tableRows[tableName]||[]; return { content: format==='json'?JSON.stringify(rows,null,2):'', filename:`${tableName}.${format}`, rowCount:rows.length }; }
  async importRows(_tableName: string, _format: 'csv' | 'json', _content: string, _mode: 'append' | 'upsert'): Promise<{ inserted: number; updated: number; total: number }> { return { inserted:0,updated:0,total:0 }; }
  async explainQuery(_sqlQuery: string, analyze: boolean): Promise<SqlExplainResult> { return { queryId:`mock_${Date.now()}`,executionTimeMs:1,analyze,plan:[{Plan:{'Node Type':'Mock Scan'}}]}; }
  async cancelQuery(): Promise<boolean> { return false; }
  async listSavedQueries(): Promise<SqlSavedQuery[]> { return []; }
  async saveQuery(name:string,query:string,favorite=false): Promise<SqlSavedQuery> { const now=new Date().toISOString(); return {id:`saved_${Date.now()}`,name,query,favorite,createdAt:now,updatedAt:now}; }
  async updateSavedQuery(id:string,updates:Partial<Pick<SqlSavedQuery,'name'|'query'|'favorite'>>): Promise<SqlSavedQuery> { const now=new Date().toISOString(); return {id,name:updates.name||'Query',query:updates.query||'SELECT 1',favorite:Boolean(updates.favorite),createdAt:now,updatedAt:now}; }
  async deleteSavedQuery(): Promise<void> {}
  async deleteRelationship(id:string): Promise<void> { this.relationships=this.relationships.filter(x=>x.id!==id); }
  async deleteIndex(id:string): Promise<void> { this.indexes=this.indexes.filter(x=>x.id!==id); }
  async rollbackMigration(id:string): Promise<DbMigration> { const item=this.migrations.find(x=>x.id===id); if(!item) throw new Error('Migração não encontrada.'); item.status='rolled_back'; item.rolledBackAt=new Date().toISOString(); return item; }
  async deleteFunction(name:string): Promise<void> { this.functions=this.functions.filter(x=>x.name!==name); }
  async setTriggerEnabled(name:string,enabled:boolean): Promise<DbTrigger> { const item=this.triggers.find(x=>x.name===name); if(!item) throw new Error('Trigger não encontrado.'); item.enabled=enabled; return item; }
  async deleteTrigger(name:string): Promise<void> { this.triggers=this.triggers.filter(x=>x.name!==name); }
  async getViews(): Promise<DbView[]> { return []; }
  async createView(name:string,query:string): Promise<DbView> { return {name,definition:query}; }
  async deleteView(): Promise<void> {}
  async getMaterializedViews(): Promise<DbMaterializedView[]> { return []; }
  async createMaterializedView(name:string,query:string,withData=true): Promise<DbMaterializedView> { return {name,definition:query,populated:withData}; }
  async refreshMaterializedView(name:string): Promise<DbMaterializedView> { return {name,definition:'SELECT 1',populated:true}; }
  async deleteMaterializedView(): Promise<void> {}
  async getEnums(): Promise<DbEnum[]> { return []; }
  async createEnum(name:string,values:string[]): Promise<DbEnum> { return {name,values}; }
  async deleteEnum(): Promise<void> {}
  async getSequences(): Promise<DbSequence[]> { return []; }
  async createSequence(input:{name:string;startValue?:number;increment?:number;cycle?:boolean}): Promise<DbSequence> { return {name:input.name,startValue:input.startValue||1,increment:input.increment||1,cycle:Boolean(input.cycle)}; }
  async deleteSequence(): Promise<void> {}
  async getExtensions(): Promise<DbExtension[]> { return []; }
  async getSchemaSnapshot(): Promise<DatabaseSchemaSnapshot> { return {generatedAt:new Date().toISOString(),tables:this.tables,relationships:this.relationships,indexes:this.indexes,views:[],materializedViews:[],enums:[],sequences:[]}; }
  async diffSchema(): Promise<DatabaseSchemaDiff> { return {hasChanges:false,changes:[],migrationSql:[]}; }
}

export class RealDatabaseService implements DatabaseService {
  private getHeaders(orgId?: string, projId?: string, envId?: string): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (orgId) headers['x-organization-id'] = orgId;
    if (projId) headers['x-project-id'] = projId;
    if (envId) headers['x-environment-id'] = envId;
    return headers;
  }

  private async responseError(res: Response, fallback: string): Promise<Error> {
    try {
      const payload = await res.json();
      const message =
        (typeof payload?.error === 'string' && payload.error) ||
        (typeof payload?.error?.message === 'string' && payload.error.message) ||
        (typeof payload?.message === 'string' && payload.message) ||
        fallback;
      return new Error(message);
    } catch {
      return new Error(fallback);
    }
  }

  async getOverview(orgId?: string, projId?: string, envId?: string): Promise<DatabaseOverview> {
    const res = await fetch('/api/database/overview', { headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao obter dados gerais do banco de dados.');
    return res.json();
  }

  async listSchemas(orgId?: string, projId?: string, envId?: string): Promise<DbSchema[]> {
    const res = await fetch('/api/database/schemas', { headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao listar schemas.');
    return res.json();
  }

  async createSchema(name: string, orgId?: string, projId?: string, envId?: string): Promise<DbSchema> {
    const res = await fetch('/api/database/schemas', { method: 'POST', headers: this.getHeaders(orgId, projId, envId), body: JSON.stringify({ name }) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao criar schema.');
    return res.json();
  }

  async deleteSchema(name: string, orgId?: string, projId?: string, envId?: string): Promise<void> {
    const res = await fetch(`/api/database/schemas/${encodeURIComponent(name)}`, { method: 'DELETE', headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao excluir schema.');
  }

  async listTables(orgId?: string, projId?: string, envId?: string): Promise<TableSchema[]> {
    const res = await fetch('/api/database/tables', { headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao listar tabelas do banco de dados.');
    return res.json();
  }

  async getTableSchema(tableName: string, orgId?: string, projId?: string, envId?: string): Promise<TableSchema | null> {
    const res = await fetch(`/api/database/tables/${encodeURIComponent(tableName)}`, { headers: this.getHeaders(orgId, projId, envId) });
    if (res.status === 404) return null;
    if (!res.ok) throw await this.responseError(res, `Falha ao obter esquema da tabela '${tableName}'.`);
    return res.json();
  }

  async createTable(table: { name: string; schema?: string; columns: ColumnDefinition[] }, orgId?: string, projId?: string, envId?: string): Promise<TableSchema> {
    const res = await fetch('/api/database/tables', { method: 'POST', headers: this.getHeaders(orgId, projId, envId), body: JSON.stringify(table) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao criar tabela.');
    return res.json();
  }

  async deleteTable(tableName: string, orgId?: string, projId?: string, envId?: string): Promise<void> {
    const res = await fetch(`/api/database/tables/${encodeURIComponent(tableName)}?confirm=${encodeURIComponent(tableName)}`, { method: 'DELETE', headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao excluir tabela.');
  }

  async getTableRows(
    tableName: string,
    options?: { limit?: number; offset?: number; search?: string; sortField?: string; sortOrder?: 'asc' | 'desc'; filters?: DatabaseRowFilter[]; orFilters?: DatabaseRowFilter[]; sorts?: DatabaseRowSort[] },
    orgId?: string,
    projId?: string,
    envId?: string
  ): Promise<{ rows: TableRow[]; totalCount: number }> {
    const queryParams = new URLSearchParams();
    if (options?.limit) queryParams.set('limit', String(options.limit));
    if (options?.offset) queryParams.set('offset', String(options.offset));
    if (options?.search) queryParams.set('search', options.search);
    if (options?.sortField) queryParams.set('sortField', options.sortField);
    if (options?.sortOrder) queryParams.set('sortOrder', options.sortOrder);
    if (options?.filters?.length) queryParams.set('filters', JSON.stringify(options.filters));
    if (options?.orFilters?.length) queryParams.set('orFilters', JSON.stringify(options.orFilters));
    if (options?.sorts?.length) queryParams.set('sorts', JSON.stringify(options.sorts));
    const res = await fetch(`/api/database/tables/${encodeURIComponent(tableName)}/rows?${queryParams.toString()}`, { headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw await this.responseError(res, `Falha ao carregar registros da tabela '${tableName}'.`);
    return res.json();
  }

  async insertRow(tableName: string, rowData: Omit<TableRow, 'id'>, orgId?: string, projId?: string, envId?: string): Promise<TableRow> {
    const res = await fetch(`/api/database/tables/${encodeURIComponent(tableName)}/rows`, { method: 'POST', headers: this.getHeaders(orgId, projId, envId), body: JSON.stringify(rowData) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao inserir registro.');
    return res.json();
  }

  async updateRow(tableName: string, rowId: string, rowData: Partial<TableRow>, orgId?: string, projId?: string, envId?: string): Promise<TableRow> {
    const res = await fetch(`/api/database/tables/${encodeURIComponent(tableName)}/rows/${encodeURIComponent(rowId)}`, { method: 'PATCH', headers: this.getHeaders(orgId, projId, envId), body: JSON.stringify(rowData) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao atualizar registro.');
    return res.json();
  }

  async deleteRow(tableName: string, rowId: string, orgId?: string, projId?: string, envId?: string): Promise<void> {
    const res = await fetch(`/api/database/tables/${encodeURIComponent(tableName)}/rows/${encodeURIComponent(rowId)}`, { method: 'DELETE', headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao excluir registro.');
  }

  async executeQuery(sqlQuery: string, orgId?: string, projId?: string, envId?: string, options?: { queryId?: string; timeoutMs?: number; maxRows?: number }): Promise<ExecuteQueryResult> {
    const res = await fetch('/api/database/sql/execute', { method: 'POST', headers: this.getHeaders(orgId, projId, envId), body: JSON.stringify({ query: sqlQuery, ...(options || {}) }) });
    if (!res.ok) throw await this.responseError(res, 'Falha na execução da consulta SQL.');
    return res.json();
  }

  async getSqlHistory(orgId?: string, projId?: string, envId?: string): Promise<SqlQueryHistory[]> {
    const res = await fetch('/api/database/sql/history', { headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao obter histórico de queries.');
    return res.json();
  }

  async getSqlMetrics(orgId?: string, projId?: string, envId?: string): Promise<SqlMetrics> {
    const res = await fetch('/api/database/sql/metrics', { headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao obter métricas SQL.');
    return res.json();
  }

  async getRelationships(orgId?: string, projId?: string, envId?: string): Promise<DbRelationship[]> {
    const res = await fetch('/api/database/relationships', { headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao obter relacionamentos.');
    return res.json();
  }

  async createRelationship(rel: Omit<DbRelationship, 'id'>, orgId?: string, projId?: string, envId?: string): Promise<DbRelationship> {
    const res = await fetch('/api/database/relationships', { method: 'POST', headers: this.getHeaders(orgId, projId, envId), body: JSON.stringify(rel) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao criar relacionamento.');
    return res.json();
  }

  async getIndexes(orgId?: string, projId?: string, envId?: string): Promise<DbIndex[]> {
    const res = await fetch('/api/database/indexes', { headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao listar índices.');
    return res.json();
  }

  async createIndex(index: Omit<DbIndex, 'id' | 'sizeKb'>, orgId?: string, projId?: string, envId?: string): Promise<DbIndex> {
    const res = await fetch('/api/database/indexes', { method: 'POST', headers: this.getHeaders(orgId, projId, envId), body: JSON.stringify(index) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao criar índice.');
    return res.json();
  }

  async getMigrations(orgId?: string, projId?: string, envId?: string): Promise<DbMigration[]> {
    const res = await fetch('/api/database/migrations', { headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao obter migrações.');
    return res.json();
  }

  async createMigration(name: string, sqlUp?: string, sqlDown?: string, orgId?: string, projId?: string, envId?: string): Promise<DbMigration> {
    const res = await fetch('/api/database/migrations', { method: 'POST', headers: this.getHeaders(orgId, projId, envId), body: JSON.stringify({ name, sqlUp, sqlDown }) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao criar migração.');
    return res.json();
  }

  async getFunctions(orgId?: string, projId?: string, envId?: string): Promise<DbFunction[]> {
    const res = await fetch('/api/database/functions', { headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao obter funções PostgreSQL.');
    return res.json();
  }

  async createFunction(fn: Omit<DbFunction, 'id' | 'createdAt'>, orgId?: string, projId?: string, envId?: string): Promise<DbFunction> {
    const res = await fetch('/api/database/functions', { method: 'POST', headers: this.getHeaders(orgId, projId, envId), body: JSON.stringify(fn) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao criar função PostgreSQL.');
    return res.json();
  }

  async getTriggers(orgId?: string, projId?: string, envId?: string): Promise<DbTrigger[]> {
    const res = await fetch('/api/database/triggers', { headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao obter triggers.');
    return res.json();
  }

  async createTrigger(trig: Omit<DbTrigger, 'id' | 'createdAt'>, orgId?: string, projId?: string, envId?: string): Promise<DbTrigger> {
    const res = await fetch('/api/database/triggers', { method: 'POST', headers: this.getHeaders(orgId, projId, envId), body: JSON.stringify(trig) });
    if (!res.ok) throw await this.responseError(res, 'Falha ao criar trigger.');
    return res.json();
  }

  async renameTable(tableName: string, renameTo: string, orgId?: string, projId?: string, envId?: string): Promise<TableSchema> {
    const res=await fetch(`/api/database/tables/${encodeURIComponent(tableName)}`,{method:'PATCH',headers:this.getHeaders(orgId,projId,envId),body:JSON.stringify({renameTo})}); if(!res.ok) throw await this.responseError(res,'Falha ao renomear tabela.'); return res.json();
  }
  async addColumn(tableName:string,column:ColumnDefinition,orgId?:string,projId?:string,envId?:string):Promise<TableSchema>{const res=await fetch(`/api/database/tables/${encodeURIComponent(tableName)}/columns`,{method:'POST',headers:this.getHeaders(orgId,projId,envId),body:JSON.stringify(column)});if(!res.ok)throw await this.responseError(res,'Falha ao adicionar coluna.');return res.json();}
  async alterColumn(tableName:string,columnName:string,updates:Partial<ColumnDefinition>&{renameTo?:string},orgId?:string,projId?:string,envId?:string):Promise<TableSchema>{const res=await fetch(`/api/database/tables/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(columnName)}`,{method:'PATCH',headers:this.getHeaders(orgId,projId,envId),body:JSON.stringify(updates)});if(!res.ok)throw await this.responseError(res,'Falha ao alterar coluna.');return res.json();}
  async deleteColumn(tableName:string,columnName:string,orgId?:string,projId?:string,envId?:string):Promise<TableSchema>{const confirm=encodeURIComponent(`${tableName}.${columnName}`);const res=await fetch(`/api/database/tables/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(columnName)}?confirm=${confirm}`,{method:'DELETE',headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao excluir coluna.');return res.json();}
  async exportRows(tableName:string,format:'csv'|'json',orgId?:string,projId?:string,envId?:string):Promise<{content:string;filename:string;rowCount:number}>{const res=await fetch(`/api/database/tables/${encodeURIComponent(tableName)}/export?format=${format}`,{headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao exportar registros.');const disposition=res.headers.get('content-disposition')||'';const filename=/filename="([^"]+)"/.exec(disposition)?.[1]||`${tableName}.${format}`;return{content:await res.text(),filename,rowCount:Number(res.headers.get('x-brisabase-row-count')||0)};}
  async importRows(tableName:string,format:'csv'|'json',content:string,mode:'append'|'upsert',orgId?:string,projId?:string,envId?:string):Promise<{inserted:number;updated:number;total:number}>{const res=await fetch(`/api/database/tables/${encodeURIComponent(tableName)}/import`,{method:'POST',headers:this.getHeaders(orgId,projId,envId),body:JSON.stringify({format,content,mode})});if(!res.ok)throw await this.responseError(res,'Falha ao importar registros.');return res.json();}
  async explainQuery(sqlQuery:string,analyze:boolean,options?:{queryId?:string;timeoutMs?:number},orgId?:string,projId?:string,envId?:string):Promise<SqlExplainResult>{const res=await fetch('/api/database/sql/explain',{method:'POST',headers:this.getHeaders(orgId,projId,envId),body:JSON.stringify({query:sqlQuery,analyze,...(options||{})})});if(!res.ok)throw await this.responseError(res,'Falha ao gerar EXPLAIN.');return res.json();}
  async cancelQuery(queryId:string,orgId?:string,projId?:string,envId?:string):Promise<boolean>{const res=await fetch(`/api/database/sql/cancel/${encodeURIComponent(queryId)}`,{method:'POST',headers:this.getHeaders(orgId,projId,envId)});if(res.status===404)return false;if(!res.ok)throw await this.responseError(res,'Falha ao cancelar query.');return Boolean((await res.json()).cancelled);}
  async listSavedQueries(orgId?:string,projId?:string,envId?:string):Promise<SqlSavedQuery[]>{const res=await fetch('/api/database/sql/saved',{headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao listar queries salvas.');return res.json();}
  async saveQuery(name:string,query:string,favorite=false,orgId?:string,projId?:string,envId?:string):Promise<SqlSavedQuery>{const res=await fetch('/api/database/sql/saved',{method:'POST',headers:this.getHeaders(orgId,projId,envId),body:JSON.stringify({name,query,favorite})});if(!res.ok)throw await this.responseError(res,'Falha ao salvar query.');return res.json();}
  async updateSavedQuery(id:string,updates:Partial<Pick<SqlSavedQuery,'name'|'query'|'favorite'>>,orgId?:string,projId?:string,envId?:string):Promise<SqlSavedQuery>{const res=await fetch(`/api/database/sql/saved/${encodeURIComponent(id)}`,{method:'PATCH',headers:this.getHeaders(orgId,projId,envId),body:JSON.stringify(updates)});if(!res.ok)throw await this.responseError(res,'Falha ao atualizar query salva.');return res.json();}
  async deleteSavedQuery(id:string,orgId?:string,projId?:string,envId?:string):Promise<void>{const res=await fetch(`/api/database/sql/saved/${encodeURIComponent(id)}`,{method:'DELETE',headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao excluir query salva.');}
  async deleteRelationship(id:string,orgId?:string,projId?:string,envId?:string):Promise<void>{const res=await fetch(`/api/database/relationships/${encodeURIComponent(id)}?confirm=${encodeURIComponent(id)}`,{method:'DELETE',headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao excluir relacionamento.');}
  async deleteIndex(id:string,orgId?:string,projId?:string,envId?:string):Promise<void>{const res=await fetch(`/api/database/indexes/${encodeURIComponent(id)}?confirm=${encodeURIComponent(id)}`,{method:'DELETE',headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao excluir índice.');}
  async rollbackMigration(id:string,orgId?:string,projId?:string,envId?:string):Promise<DbMigration>{const res=await fetch(`/api/database/migrations/${encodeURIComponent(id)}/rollback`,{method:'POST',headers:this.getHeaders(orgId,projId,envId),body:JSON.stringify({confirm:id})});if(!res.ok)throw await this.responseError(res,'Falha ao reverter migration.');return res.json();}
  async deleteFunction(name:string,orgId?:string,projId?:string,envId?:string):Promise<void>{const res=await fetch(`/api/database/functions/${encodeURIComponent(name)}?confirm=${encodeURIComponent(name)}`,{method:'DELETE',headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao excluir função.');}
  async setTriggerEnabled(name:string,enabled:boolean,orgId?:string,projId?:string,envId?:string):Promise<DbTrigger>{const res=await fetch(`/api/database/triggers/${encodeURIComponent(name)}`,{method:'PATCH',headers:this.getHeaders(orgId,projId,envId),body:JSON.stringify({enabled})});if(!res.ok)throw await this.responseError(res,'Falha ao alterar trigger.');return res.json();}
  async deleteTrigger(name:string,orgId?:string,projId?:string,envId?:string):Promise<void>{const res=await fetch(`/api/database/triggers/${encodeURIComponent(name)}?confirm=${encodeURIComponent(name)}`,{method:'DELETE',headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao excluir trigger.');}
  async getViews(orgId?:string,projId?:string,envId?:string):Promise<DbView[]>{const res=await fetch('/api/database/objects/views',{headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao listar views.');return res.json();}
  async createView(name:string,query:string,replace=false,orgId?:string,projId?:string,envId?:string):Promise<DbView>{const res=await fetch('/api/database/objects/views',{method:'POST',headers:this.getHeaders(orgId,projId,envId),body:JSON.stringify({name,query,replace})});if(!res.ok)throw await this.responseError(res,'Falha ao criar view.');return res.json();}
  async deleteView(name:string,orgId?:string,projId?:string,envId?:string):Promise<void>{const res=await fetch(`/api/database/objects/views/${encodeURIComponent(name)}?confirm=${encodeURIComponent(name)}`,{method:'DELETE',headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao excluir view.');}
  async getMaterializedViews(orgId?:string,projId?:string,envId?:string):Promise<DbMaterializedView[]>{const res=await fetch('/api/database/objects/materialized-views',{headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao listar materialized views.');return res.json();}
  async createMaterializedView(name:string,query:string,withData=true,orgId?:string,projId?:string,envId?:string):Promise<DbMaterializedView>{const res=await fetch('/api/database/objects/materialized-views',{method:'POST',headers:this.getHeaders(orgId,projId,envId),body:JSON.stringify({name,query,withData})});if(!res.ok)throw await this.responseError(res,'Falha ao criar materialized view.');return res.json();}
  async refreshMaterializedView(name:string,orgId?:string,projId?:string,envId?:string):Promise<DbMaterializedView>{const res=await fetch(`/api/database/objects/materialized-views/${encodeURIComponent(name)}/refresh`,{method:'POST',headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao atualizar materialized view.');return res.json();}
  async deleteMaterializedView(name:string,orgId?:string,projId?:string,envId?:string):Promise<void>{const res=await fetch(`/api/database/objects/materialized-views/${encodeURIComponent(name)}?confirm=${encodeURIComponent(name)}`,{method:'DELETE',headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao excluir materialized view.');}
  async getEnums(orgId?:string,projId?:string,envId?:string):Promise<DbEnum[]>{const res=await fetch('/api/database/objects/enums',{headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao listar enums.');return res.json();}
  async createEnum(name:string,values:string[],orgId?:string,projId?:string,envId?:string):Promise<DbEnum>{const res=await fetch('/api/database/objects/enums',{method:'POST',headers:this.getHeaders(orgId,projId,envId),body:JSON.stringify({name,values})});if(!res.ok)throw await this.responseError(res,'Falha ao criar enum.');return res.json();}
  async deleteEnum(name:string,orgId?:string,projId?:string,envId?:string):Promise<void>{const res=await fetch(`/api/database/objects/enums/${encodeURIComponent(name)}?confirm=${encodeURIComponent(name)}`,{method:'DELETE',headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao excluir enum.');}
  async getSequences(orgId?:string,projId?:string,envId?:string):Promise<DbSequence[]>{const res=await fetch('/api/database/objects/sequences',{headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao listar sequences.');return res.json();}
  async createSequence(input:{name:string;startValue?:number;increment?:number;cycle?:boolean},orgId?:string,projId?:string,envId?:string):Promise<DbSequence>{const res=await fetch('/api/database/objects/sequences',{method:'POST',headers:this.getHeaders(orgId,projId,envId),body:JSON.stringify(input)});if(!res.ok)throw await this.responseError(res,'Falha ao criar sequence.');return res.json();}
  async deleteSequence(name:string,orgId?:string,projId?:string,envId?:string):Promise<void>{const res=await fetch(`/api/database/objects/sequences/${encodeURIComponent(name)}?confirm=${encodeURIComponent(name)}`,{method:'DELETE',headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao excluir sequence.');}
  async getExtensions(orgId?:string,projId?:string,envId?:string):Promise<DbExtension[]>{const res=await fetch('/api/database/objects/extensions',{headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao listar extensões.');return res.json();}
  async getSchemaSnapshot(orgId?:string,projId?:string,envId?:string):Promise<DatabaseSchemaSnapshot>{const res=await fetch('/api/database/schema/snapshot',{headers:this.getHeaders(orgId,projId,envId)});if(!res.ok)throw await this.responseError(res,'Falha ao gerar snapshot do schema.');return res.json();}
  async diffSchema(baseline:DatabaseSchemaSnapshot,orgId?:string,projId?:string,envId?:string):Promise<DatabaseSchemaDiff>{const res=await fetch('/api/database/schema/diff',{method:'POST',headers:this.getHeaders(orgId,projId,envId),body:JSON.stringify({baseline})});if(!res.ok)throw await this.responseError(res,'Falha ao comparar schema.');return res.json();}

}

const metaEnv = (import.meta as any).env;
const databaseMode = metaEnv?.VITE_DATA_SOURCE || 'api';

export const mockDatabaseService = new MockDatabaseService();
export const realDatabaseService = new RealDatabaseService();
export const databaseService = databaseMode === 'mock' ? mockDatabaseService : realDatabaseService;
