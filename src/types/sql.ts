export interface SqlColumn {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  defaultValue?: string;
  references?: string;
}

export interface SqlTable {
  id: string;
  schema: string;
  name: string;
  columns: SqlColumn[];
  rows: Record<string, unknown>[];
  size: string;
  rlsEnabled: boolean;
  realtimeEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SqlIndex {
  id: string;
  name: string;
  table: string;
  columns: string[];
  unique?: boolean;
  method?: string;
  status: 'ready' | 'building';
}

export interface SqlView {
  id: string;
  schema: string;
  name: string;
  materialized: boolean;
  definition: string;
  rowsEstimate: number;
}

export interface SqlSavedQuery {
  id: string;
  name: string;
  sql: string;
  createdAt: string;
  updatedAt: string;
}

export interface SqlQueryHistoryItem {
  id: string;
  sql: string;
  command: string;
  status: 'success' | 'error';
  durationMs: number;
  affectedRows: number;
  executedAt: string;
  message: string;
}

export interface SqlDatabaseState {
  tables: SqlTable[];
  indexes: SqlIndex[];
  views: SqlView[];
  extensions: string[];
  savedQueries: SqlSavedQuery[];
  history: SqlQueryHistoryItem[];
}

export interface SqlExecutionResult {
  status: 'success' | 'error';
  command: string;
  message: string;
  durationMs: number;
  affectedRows: number;
  columns: string[];
  rows: Record<string, unknown>[];
  plan?: string[];
  schemaChanged?: boolean;
}
