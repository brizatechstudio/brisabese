import { initialSqlDatabaseState } from '../data/mockSqlDatabase';
import {
  SqlColumn,
  SqlDatabaseState,
  SqlExecutionResult,
  SqlIndex,
  SqlQueryHistoryItem,
  SqlSavedQuery,
  SqlTable,
  SqlView
} from '../types/sql';

const KEY_PREFIX = 'brisabase_sql_database_v1';

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const storageKey = (projectId?: string) => `${KEY_PREFIX}:${projectId || 'default'}`;

export function getSqlDatabaseState(projectId?: string): SqlDatabaseState {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    return raw ? JSON.parse(raw) : deepClone(initialSqlDatabaseState);
  } catch {
    return deepClone(initialSqlDatabaseState);
  }
}

export function saveSqlDatabaseState(projectId: string | undefined, state: SqlDatabaseState): void {
  localStorage.setItem(storageKey(projectId), JSON.stringify(state));
}

export function resetSqlDatabaseState(projectId?: string): SqlDatabaseState {
  const next = deepClone(initialSqlDatabaseState);
  saveSqlDatabaseState(projectId, next);
  return next;
}

function normalizeIdentifier(value: string): string {
  return value.trim().replace(/["`]/g, '').replace(/;$/, '');
}

function parseQualifiedName(raw: string): { schema: string; name: string } {
  const cleaned = normalizeIdentifier(raw);
  const parts = cleaned.split('.');
  if (parts.length > 1) return { schema: parts[0], name: parts.slice(1).join('.') };
  return { schema: 'public', name: cleaned };
}

function splitSqlList(input: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quote) {
      current += char;
      if (char === quote && input[i - 1] !== '\\') quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function parseLiteral(value: string): unknown {
  const trimmed = value.trim();
  if (/^null$/i.test(trimmed)) return null;
  if (/^true$/i.test(trimmed)) return true;
  if (/^false$/i.test(trimmed)) return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (/^now\(\)$/i.test(trimmed)) return new Date().toISOString();
  if (/^gen_random_uuid\(\)$/i.test(trimmed)) return `mock-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  return trimmed.replace(/^'(.*)'$/s, '$1').replace(/^"(.*)"$/s, '$1');
}

function parseColumnDefinition(definition: string): SqlColumn | null {
  const trimmed = definition.trim().replace(/,$/, '');
  if (!trimmed) return null;
  if (/^(constraint|primary\s+key|foreign\s+key|unique\s*\()/i.test(trimmed)) return null;

  const match = trimmed.match(/^(["`\w-]+)\s+([\w\s\[\]\(\),]+?)(?=\s+(?:not\s+null|null|primary\s+key|unique|default|references|check)\b|$)(.*)$/i);
  if (!match) return null;

  const [, rawName, rawType, rest = ''] = match;
  const defaultMatch = rest.match(/\bdefault\s+(.+?)(?=\s+(?:not\s+null|null|primary\s+key|unique|references|check)\b|$)/i);
  const referencesMatch = rest.match(/\breferences\s+([^\s,]+)/i);

  return {
    name: normalizeIdentifier(rawName),
    type: rawType.trim().replace(/\s+/g, ' '),
    nullable: !/\bnot\s+null\b/i.test(rest) && !/\bprimary\s+key\b/i.test(rest),
    primaryKey: /\bprimary\s+key\b/i.test(rest),
    unique: /\bunique\b/i.test(rest),
    defaultValue: defaultMatch?.[1]?.trim(),
    references: referencesMatch?.[1]?.trim()
  };
}

function createMockRow(table: SqlTable): Record<string, unknown> {
  return Object.fromEntries(
    table.columns.map((column) => {
      if (column.defaultValue) return [column.name, parseLiteral(column.defaultValue)];
      if (column.primaryKey && column.type.toLowerCase().includes('uuid')) return [column.name, `mock-${Math.random().toString(36).slice(2, 10)}`];
      return [column.name, null];
    })
  );
}

function findTable(state: SqlDatabaseState, rawName: string): SqlTable | undefined {
  const { schema, name } = parseQualifiedName(rawName);
  return state.tables.find((table) => table.schema === schema && table.name === name)
    || state.tables.find((table) => table.name === name);
}

function tableColumnsForSelect(sql: string, table: SqlTable): string[] {
  const match = sql.match(/^\s*(?:explain(?:\s+analyze)?\s+)?select\s+([\s\S]+?)\s+from\s+/i);
  if (!match) return table.columns.map((column) => column.name);
  const raw = match[1].trim();
  if (raw === '*' || raw.includes('.*')) return table.columns.map((column) => column.name);
  return splitSqlList(raw).map((part) => {
    const alias = part.match(/\s+as\s+([\w"]+)$/i)?.[1];
    if (alias) return normalizeIdentifier(alias);
    return normalizeIdentifier(part.split('.').pop() || part).replace(/\(.+\)/, 'value');
  });
}

function result(
  command: string,
  message: string,
  durationMs: number,
  options: Partial<SqlExecutionResult> = {}
): SqlExecutionResult {
  return {
    status: 'success',
    command,
    message,
    durationMs,
    affectedRows: 0,
    columns: [],
    rows: [],
    ...options
  };
}

function errorResult(message: string): SqlExecutionResult {
  return {
    status: 'error',
    command: 'ERROR',
    message,
    durationMs: 2,
    affectedRows: 0,
    columns: [],
    rows: []
  };
}

export async function executeSql(projectId: string | undefined, sqlInput: string): Promise<SqlExecutionResult> {
  const started = performance.now();
  const sql = sqlInput.trim();
  if (!sql) return errorResult('Nenhum comando SQL para executar.');

  await new Promise((resolve) => window.setTimeout(resolve, 280));
  const state = getSqlDatabaseState(projectId);
  let execution: SqlExecutionResult;
  let schemaChanged = false;

  try {
    const createTable = sql.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?([^\s(]+)\s*\(([\s\S]+)\)\s*;?$/i);
    if (createTable) {
      const { schema, name } = parseQualifiedName(createTable[1]);
      if (state.tables.some((table) => table.schema === schema && table.name === name)) {
        execution = errorResult(`relation "${schema}.${name}" already exists`);
      } else {
        const definitions = splitSqlList(createTable[2]);
        const columns = definitions.map(parseColumnDefinition).filter(Boolean) as SqlColumn[];
        if (columns.length === 0) throw new Error('Não foi possível identificar as colunas do CREATE TABLE.');
        const now = new Date().toISOString();
        state.tables.unshift({
          id: `tbl-${Date.now()}`,
          schema,
          name,
          columns,
          rows: [],
          size: '0 bytes',
          rlsEnabled: false,
          realtimeEnabled: false,
          createdAt: now,
          updatedAt: now
        });
        schemaChanged = true;
        execution = result('CREATE TABLE', `Tabela ${schema}.${name} criada no mock.`, 18, { schemaChanged: true });
      }
    } else {
      const alterAdd = sql.match(/alter\s+table\s+([^\s]+)\s+add\s+(?:column\s+)?([\s\S]+?);?$/i);
      const dropTable = sql.match(/drop\s+table\s+(?:if\s+exists\s+)?([^\s;]+)/i);
      const createIndex = sql.match(/create\s+(unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([^\s]+)\s+on\s+([^\s(]+)(?:\s+using\s+(\w+))?\s*\(([^)]+)\)/i);
      const createView = sql.match(/create\s+(materialized\s+)?view\s+([^\s]+)\s+as\s+([\s\S]+)$/i);
      const dropView = sql.match(/drop\s+(?:materialized\s+)?view\s+(?:if\s+exists\s+)?([^\s;]+)/i);
      const extension = sql.match(/create\s+extension\s+(?:if\s+not\s+exists\s+)?["']?([\w-]+)["']?/i);
      const insert = sql.match(/insert\s+into\s+([^\s(]+)\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/i);
      const select = sql.match(/(?:^|;)\s*(?:explain(?:\s+analyze)?\s+)?select[\s\S]+?\s+from\s+([^\s;,]+)/i);
      const update = sql.match(/update\s+([^\s]+)\s+set\s+/i);
      const deleteFrom = sql.match(/delete\s+from\s+([^\s;]+)/i);
      const truncate = sql.match(/truncate\s+(?:table\s+)?([^\s;]+)/i);

      if (alterAdd) {
        const table = findTable(state, alterAdd[1]);
        if (!table) execution = errorResult(`relation "${alterAdd[1]}" does not exist`);
        else {
          const column = parseColumnDefinition(alterAdd[2].replace(/;$/, ''));
          if (!column) execution = errorResult('Não foi possível interpretar a nova coluna.');
          else if (table.columns.some((item) => item.name === column.name)) execution = errorResult(`column "${column.name}" already exists`);
          else {
            table.columns.push(column);
            table.rows = table.rows.map((row) => ({ ...row, [column.name]: column.defaultValue ? parseLiteral(column.defaultValue) : null }));
            table.updatedAt = new Date().toISOString();
            schemaChanged = true;
            execution = result('ALTER TABLE', `Coluna ${column.name} adicionada a ${table.schema}.${table.name}.`, 12, { schemaChanged: true });
          }
        }
      } else if (dropTable) {
        const table = findTable(state, dropTable[1]);
        if (!table) execution = errorResult(`relation "${dropTable[1]}" does not exist`);
        else {
          state.tables = state.tables.filter((item) => item.id !== table.id);
          state.indexes = state.indexes.filter((index) => !index.table.endsWith(`.${table.name}`) && index.table !== table.name);
          schemaChanged = true;
          execution = result('DROP TABLE', `Tabela ${table.schema}.${table.name} removida do mock.`, 9, { schemaChanged: true });
        }
      } else if (createIndex) {
        const table = findTable(state, createIndex[3]);
        if (!table) execution = errorResult(`relation "${createIndex[3]}" does not exist`);
        else {
          const index: SqlIndex = {
            id: `idx-${Date.now()}`,
            name: normalizeIdentifier(createIndex[2]),
            table: `${table.schema}.${table.name}`,
            columns: createIndex[5].split(',').map(normalizeIdentifier),
            unique: Boolean(createIndex[1]),
            method: createIndex[4] || 'btree',
            status: 'ready'
          };
          state.indexes.unshift(index);
          schemaChanged = true;
          execution = result('CREATE INDEX', `Índice ${index.name} criado no mock.`, 28, { schemaChanged: true });
        }
      } else if (createView) {
        const { schema, name } = parseQualifiedName(createView[2]);
        const view: SqlView = {
          id: `view-${Date.now()}`,
          schema,
          name,
          materialized: Boolean(createView[1]),
          definition: createView[3].replace(/;$/, '').trim(),
          rowsEstimate: 24
        };
        state.views = [view, ...state.views.filter((item) => !(item.schema === schema && item.name === name))];
        schemaChanged = true;
        execution = result(createView[1] ? 'CREATE MATERIALIZED VIEW' : 'CREATE VIEW', `View ${schema}.${name} criada no mock.`, 17, { schemaChanged: true });
      } else if (dropView) {
        const { schema, name } = parseQualifiedName(dropView[1]);
        state.views = state.views.filter((view) => !(view.schema === schema && view.name === name));
        schemaChanged = true;
        execution = result('DROP VIEW', `View ${schema}.${name} removida do mock.`, 8, { schemaChanged: true });
      } else if (extension) {
        const name = extension[1];
        if (!state.extensions.includes(name)) state.extensions.push(name);
        schemaChanged = true;
        execution = result('CREATE EXTENSION', `Extensão ${name} habilitada no mock.`, 21, { schemaChanged: true });
      } else if (insert) {
        const table = findTable(state, insert[1]);
        if (!table) execution = errorResult(`relation "${insert[1]}" does not exist`);
        else {
          const columns = insert[2].split(',').map(normalizeIdentifier);
          const values = splitSqlList(insert[3]).map(parseLiteral);
          const row = createMockRow(table);
          columns.forEach((column, index) => { row[column] = values[index]; });
          table.rows.unshift(row);
          table.updatedAt = new Date().toISOString();
          execution = result('INSERT', 'INSERT 0 1', 7, { affectedRows: 1, columns, rows: [row] });
        }
      } else if (select) {
        const table = findTable(state, select[1]);
        if (!table) execution = errorResult(`relation "${select[1]}" does not exist`);
        else {
          const columns = tableColumnsForSelect(sql, table);
          const limit = Number(sql.match(/\blimit\s+(\d+)/i)?.[1] || 100);
          const selectedRows = table.rows.slice(0, limit).map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null])));
          const explain = /^\s*explain/i.test(sql);
          execution = result(explain ? 'EXPLAIN' : 'SELECT', `${selectedRows.length} rows returned`, 14 + selectedRows.length, {
            affectedRows: selectedRows.length,
            columns,
            rows: explain ? [] : selectedRows,
            plan: explain ? [
              `Limit  (cost=0.29..8.31 rows=${Math.max(1, selectedRows.length)} width=128)`,
              `  ->  Index Scan using ${state.indexes.find((idx) => idx.table.endsWith(`.${table.name}`))?.name || `${table.name}_pkey`} on ${table.name}`,
              `        Filter: simulated_predicate`,
              `Planning Time: 0.412 ms`,
              `Execution Time: ${(4.1 + selectedRows.length / 10).toFixed(3)} ms`
            ] : undefined
          });
        }
      } else if (update) {
        const table = findTable(state, update[1]);
        if (!table) execution = errorResult(`relation "${update[1]}" does not exist`);
        else execution = result('UPDATE', `UPDATE ${Math.min(table.rows.length, 3)}`, 11, { affectedRows: Math.min(table.rows.length, 3) });
      } else if (deleteFrom) {
        const table = findTable(state, deleteFrom[1]);
        if (!table) execution = errorResult(`relation "${deleteFrom[1]}" does not exist`);
        else {
          const affected = table.rows.length > 0 ? 1 : 0;
          if (affected) table.rows = table.rows.slice(1);
          execution = result('DELETE', `DELETE ${affected}`, 9, { affectedRows: affected });
        }
      } else if (truncate) {
        const table = findTable(state, truncate[1]);
        if (!table) execution = errorResult(`relation "${truncate[1]}" does not exist`);
        else {
          const affected = table.rows.length;
          table.rows = [];
          execution = result('TRUNCATE', `TRUNCATE TABLE ${table.schema}.${table.name}`, 10, { affectedRows: affected });
        }
      } else if (/^\s*(begin|commit|rollback)\b/i.test(sql)) {
        const command = sql.match(/^\s*(begin|commit|rollback)/i)?.[1].toUpperCase() || 'TRANSACTION';
        execution = result(command, `${command} executado em transação simulada.`, 3);
      } else if (/create\s+(?:or\s+replace\s+)?function\b/i.test(sql)) {
        schemaChanged = true;
        execution = result('CREATE FUNCTION', 'Database function criada em modo simulado.', 19, { schemaChanged: true });
      } else if (/create\s+trigger\b/i.test(sql)) {
        schemaChanged = true;
        execution = result('CREATE TRIGGER', 'Trigger criado em modo simulado.', 16, { schemaChanged: true });
      } else if (/create\s+policy\b|alter\s+table[\s\S]+enable\s+row\s+level\s+security/i.test(sql)) {
        schemaChanged = true;
        execution = result('SECURITY DDL', 'Policy/RLS aplicada somente ao mock.', 13, { schemaChanged: true });
      } else {
        execution = result('SQL', 'Comando aceito pelo executor simulado. Nenhuma infraestrutura real foi alterada.', 8);
      }
    }
  } catch (error) {
    execution = errorResult(error instanceof Error ? error.message : 'Erro ao interpretar SQL no mock.');
  }

  const durationMs = Math.max(1, Math.round(performance.now() - started));
  execution.durationMs = durationMs;
  execution.schemaChanged = execution.schemaChanged || schemaChanged;

  const historyItem: SqlQueryHistoryItem = {
    id: `hist-${Date.now()}`,
    sql,
    command: execution.command,
    status: execution.status,
    durationMs,
    affectedRows: execution.affectedRows,
    executedAt: new Date().toISOString(),
    message: execution.message
  };
  state.history = [historyItem, ...state.history].slice(0, 50);
  saveSqlDatabaseState(projectId, state);
  return execution;
}

export function saveSqlQuery(projectId: string | undefined, name: string, sql: string): SqlSavedQuery {
  const state = getSqlDatabaseState(projectId);
  const existing = state.savedQueries.find((query) => query.name.toLowerCase() === name.toLowerCase());
  const now = new Date().toISOString();
  const saved: SqlSavedQuery = existing
    ? { ...existing, sql, updatedAt: now }
    : { id: `saved-${Date.now()}`, name, sql, createdAt: now, updatedAt: now };
  state.savedQueries = [saved, ...state.savedQueries.filter((query) => query.id !== saved.id)];
  saveSqlDatabaseState(projectId, state);
  return saved;
}

export function createSqlTable(projectId: string | undefined, name: string, columns: SqlColumn[]): SqlTable {
  const state = getSqlDatabaseState(projectId);
  const { schema, name: tableName } = parseQualifiedName(name);
  if (state.tables.some((table) => table.schema === schema && table.name === tableName)) throw new Error('Tabela já existe');
  const now = new Date().toISOString();
  const table: SqlTable = {
    id: `tbl-${Date.now()}`,
    schema,
    name: tableName,
    columns,
    rows: [],
    size: '0 bytes',
    rlsEnabled: false,
    realtimeEnabled: false,
    createdAt: now,
    updatedAt: now
  };
  state.tables.unshift(table);
  saveSqlDatabaseState(projectId, state);
  return table;
}

export function updateSqlTable(projectId: string | undefined, tableId: string, updater: (table: SqlTable) => SqlTable): SqlTable {
  const state = getSqlDatabaseState(projectId);
  const index = state.tables.findIndex((table) => table.id === tableId);
  if (index === -1) throw new Error('Tabela não encontrada');
  const updated = updater(deepClone(state.tables[index]));
  updated.updatedAt = new Date().toISOString();
  state.tables[index] = updated;
  saveSqlDatabaseState(projectId, state);
  return updated;
}
