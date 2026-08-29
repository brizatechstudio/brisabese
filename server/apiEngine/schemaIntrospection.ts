import { projectDbManager, TableDef, ColumnDef, DbRelationshipDef } from '../db/projectDatabase';

export interface ColumnIntrospection {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isNullable: boolean;
  isUnique: boolean;
  defaultValue?: string;
}

export interface RelationshipIntrospection {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

export interface ApiResource {
  schema: string;
  table: string;
  columns: ColumnIntrospection[];
  primaryKey: string;
  relationships: RelationshipIntrospection[];
}

export const RESERVED_SYSTEM_TABLES = [
  'auth_users',
  'auth_sessions',
  'auth_refresh_tokens',
  'auth_mfa_factors',
  'auth_mfa_recovery_codes',
  'system_logs',
  'audit_logs',
];

export const RESERVED_SYSTEM_SCHEMAS = ['pg_catalog', 'information_schema', 'auth', 'storage'];

export class SchemaIntrospectionService {
  /**
   * Introspects project database schema for given orgId, projId, envId
   * Filters out reserved system tables and system schemas.
   */
  public static getExposedResources(orgId: string, projId: string, envId: string): ApiResource[] {
    const store = projectDbManager.getOrCreateStore(orgId, projId, envId);
    const tables = Array.from(store.tables.values());

    const exposedTables = tables.filter((t) => {
      const schemaName = (t.schema || 'public').toLowerCase();
      const tableName = t.name.toLowerCase();

      if (RESERVED_SYSTEM_SCHEMAS.includes(schemaName)) return false;
      if (RESERVED_SYSTEM_TABLES.includes(tableName)) return false;

      return true;
    });

    return exposedTables.map((t) => this.tableToApiResource(t, store.relationships));
  }

  /**
   * Returns metadata for a single table if exposed
   */
  public static getResource(orgId: string, projId: string, envId: string, tableName: string): ApiResource | null {
    const store = projectDbManager.getOrCreateStore(orgId, projId, envId);
    const table = store.tables.get(tableName.toLowerCase());
    if (!table) return null;

    const schemaName = (table.schema || 'public').toLowerCase();
    const tName = table.name.toLowerCase();

    if (RESERVED_SYSTEM_SCHEMAS.includes(schemaName)) return null;
    if (RESERVED_SYSTEM_TABLES.includes(tName)) return null;

    return this.tableToApiResource(table, store.relationships);
  }

  private static tableToApiResource(table: TableDef, allRels: DbRelationshipDef[]): ApiResource {
    const pkCol = table.columns.find((c) => c.isPrimaryKey)?.name || 'id';

    const columns: ColumnIntrospection[] = table.columns.map((c) => ({
      name: c.name,
      type: c.type,
      isPrimaryKey: !!c.isPrimaryKey,
      isNullable: c.isNullable !== false,
      isUnique: !!c.isUnique,
      defaultValue: c.defaultValue,
    }));

    const tableName = table.name.toLowerCase();
    const relationships: RelationshipIntrospection[] = allRels
      .filter((r) => r.fromTable.toLowerCase() === tableName || r.toTable.toLowerCase() === tableName)
      .map((r) => ({
        fromTable: r.fromTable,
        fromColumn: r.fromColumn,
        toTable: r.toTable,
        toColumn: r.toColumn,
        type: r.type,
      }));

    return {
      schema: table.schema || 'public',
      table: table.name,
      columns,
      primaryKey: pkCol,
      relationships,
    };
  }
}
