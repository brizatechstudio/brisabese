const PROTECTED_RESOURCE = /\b(?:__brisabase_migrations|brisabase_schema_migrations|project_database_registry)\b/i;
const SYSTEM_SCHEMA = /\b(?:pg_catalog|information_schema|pg_toast)\s*\./i;
const SYSTEM_RELATION = /\b(?:FROM|JOIN|UPDATE|INTO|REFERENCES|DELETE\s+FROM|TABLE|TRUNCATE(?:\s+TABLE)?|ON)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:ONLY\s+)?"?pg_[A-Za-z0-9_]+"?/i;
const DANGEROUS_SQL = /\b(?:GRANT|REVOKE|COPY|DO|CALL|LISTEN|NOTIFY|LOAD|VACUUM|CLUSTER|REINDEX|CHECKPOINT|DISCARD|RESET)\b|\bALTER\s+(?:SYSTEM|ROLE|USER|DATABASE)\b|\bCREATE\s+(?:DATABASE|ROLE|USER|SCHEMA|EXTENSION|SERVER|FOREIGN\s+DATA\s+WRAPPER|PUBLICATION|SUBSCRIPTION|EVENT\s+TRIGGER|FUNCTION|PROCEDURE|TRIGGER)\b|\bDROP\s+(?:DATABASE|ROLE|USER|SCHEMA|EXTENSION|SERVER|PUBLICATION|SUBSCRIPTION|EVENT\s+TRIGGER|FUNCTION|PROCEDURE|TRIGGER)\b|\bSET\s+(?:ROLE|SESSION\s+AUTHORIZATION|search_path)\b|\bALTER\s+TABLE\b[^;]*\b(?:SET\s+SCHEMA|OWNER\s+TO|SET\s+TABLESPACE|ATTACH\s+PARTITION|DETACH\s+PARTITION)\b/i;
const DANGEROUS_FUNCTION = /\b(?:pg_[A-Za-z0-9_]*|dblink[A-Za-z0-9_]*|lo_[A-Za-z0-9_]*|query_to_xml[A-Za-z0-9_]*|database_to_xml[A-Za-z0-9_]*|schema_to_xml[A-Za-z0-9_]*|table_to_xml[A-Za-z0-9_]*|cursor_to_xml[A-Za-z0-9_]*|current_setting|set_config|to_reg[A-Za-z0-9_]*|has_[A-Za-z0-9_]*_privilege|nextval|currval|setval|lastval)\s*\(/i;
const PHYSICAL_SCHEMA_INTROSPECTION = /\bcurrent_schema(?:s)?\b/i;

export type ScopedSqlKind = 'read' | 'write' | 'ddl';

export interface ScopedSqlStatement {
  sql: string;
  kind: ScopedSqlKind;
  readOnly: boolean;
}

function scrubSingleQuotedStrings(sql: string): string {
  let output = '';
  let inString = false;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (inString) {
      if (char === "'" && sql[i + 1] === "'") {
        output += '  ';
        i += 1;
        continue;
      }
      if (char === "'") {
        inString = false;
        output += "'";
      } else {
        output += ' ';
      }
      continue;
    }
    if (char === "'") {
      inString = true;
      output += "'";
      continue;
    }
    output += char;
  }
  if (inString) throw new Error('SQL contains an unterminated string literal.');
  return output;
}

function normalizeSingleStatement(sql: string): { sql: string; scrubbed: string } {
  let normalized = String(sql || '').trim();
  if (!normalized) throw new Error('SQL statement is required.');

  let scrubbed = scrubSingleQuotedStrings(normalized);
  if (/(?:--|\/\*|\*\/)/.test(scrubbed)) throw new Error('SQL comments are not accepted in the scoped editor.');
  if (/\$[A-Za-z0-9_]*\$/.test(scrubbed)) throw new Error('Dollar-quoted SQL is not accepted in the scoped editor. Use the Functions editor for function bodies.');

  if (scrubbed.trimEnd().endsWith(';')) {
    normalized = normalized.trimEnd().slice(0, -1).trimEnd();
    scrubbed = scrubSingleQuotedStrings(normalized);
  }
  if (scrubbed.includes(';')) throw new Error('Execute one SQL statement at a time.');
  if (!normalized) throw new Error('SQL statement is required.');
  return { sql: normalized, scrubbed };
}

function assertNoQualifiedExternalRelations(scrubbed: string): void {
  const patterns = [
    /\b(?:FROM|JOIN|UPDATE|INTO|REFERENCES)\s+(?:ONLY\s+)?"?[A-Za-z_][A-Za-z0-9_]*"?\s*\.\s*"?[A-Za-z_][A-Za-z0-9_]*"?/i,
    /\bDELETE\s+FROM\s+(?:ONLY\s+)?"?[A-Za-z_][A-Za-z0-9_]*"?\s*\.\s*"?[A-Za-z_][A-Za-z0-9_]*"?/i,
    /\b(?:CREATE|ALTER|DROP)\s+TABLE(?:\s+IF\s+(?:NOT\s+)?EXISTS)?\s+(?:ONLY\s+)?"?[A-Za-z_][A-Za-z0-9_]*"?\s*\.\s*"?[A-Za-z_][A-Za-z0-9_]*"?/i,
    /\bTRUNCATE(?:\s+TABLE)?\s+(?:ONLY\s+)?"?[A-Za-z_][A-Za-z0-9_]*"?\s*\.\s*"?[A-Za-z_][A-Za-z0-9_]*"?/i,
    /\bCREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+"?[A-Za-z_][A-Za-z0-9_]*"?\s+ON\s+(?:ONLY\s+)?"?[A-Za-z_][A-Za-z0-9_]*"?\s*\.\s*"?[A-Za-z_][A-Za-z0-9_]*"?/i,
    /\bDROP\s+INDEX(?:\s+IF\s+EXISTS)?\s+"?[A-Za-z_][A-Za-z0-9_]*"?\s*\.\s*"?[A-Za-z_][A-Za-z0-9_]*"?/i,
  ];
  if (patterns.some((pattern) => pattern.test(scrubbed))) {
    throw new Error('Schema-qualified relations are not accepted. Use unqualified names; BrisaBase scopes them to this project environment.');
  }
}

function assertCommonSafety(scrubbed: string): void {
  if (PROTECTED_RESOURCE.test(scrubbed) || SYSTEM_SCHEMA.test(scrubbed) || SYSTEM_RELATION.test(scrubbed)) {
    throw new Error('This SQL statement targets a protected BrisaBase or PostgreSQL system resource.');
  }
  if (DANGEROUS_SQL.test(scrubbed) || DANGEROUS_FUNCTION.test(scrubbed) || PHYSICAL_SCHEMA_INTROSPECTION.test(scrubbed)) {
    throw new Error('This SQL operation is not permitted in the scoped Database Editor.');
  }
  if (/\b"?[A-Za-z_][A-Za-z0-9_]*"?\s*\.\s*"?[A-Za-z_][A-Za-z0-9_]*"?\s*\(/.test(scrubbed)) {
    throw new Error('Schema-qualified function calls are not accepted in the scoped Database Editor.');
  }
  if (/::\s*(?:regclass|regnamespace|regrole|regprocedure|regtype|regoperator)\b/i.test(scrubbed)) {
    throw new Error('PostgreSQL registry casts are not accepted in the scoped Database Editor.');
  }
  assertNoQualifiedExternalRelations(scrubbed);
}

export function prepareScopedSql(sql: string): ScopedSqlStatement {
  const normalized = normalizeSingleStatement(sql);
  const statement = normalized.scrubbed.trim();
  assertCommonSafety(statement);

  if (/^SELECT\b/i.test(statement) || /^VALUES\b/i.test(statement)) {
    return { sql: normalized.sql, kind: 'read', readOnly: true };
  }
  if (/^WITH\b/i.test(statement)) {
    if (/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(statement)) {
      throw new Error('Data-changing CTEs are not accepted in the scoped Database Editor.');
    }
    return { sql: normalized.sql, kind: 'read', readOnly: true };
  }
  if (/^EXPLAIN\b/i.test(statement)) {
    throw new Error('Use the dedicated EXPLAIN / EXPLAIN ANALYZE action for query plans.');
  }
  if (/^(?:INSERT\s+INTO|UPDATE\b|DELETE\s+FROM)\b/i.test(statement)) {
    return { sql: normalized.sql, kind: 'write', readOnly: false };
  }
  if (/^CREATE\s+TABLE\b/i.test(statement) && /\b(?:AS\s+SELECT|LIKE)\b/i.test(statement)) {
    throw new Error('CREATE TABLE AS/LIKE is not accepted in the scoped Database Editor. Create explicit columns instead.');
  }
  if (/^(?:CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE(?:\s+TABLE)?|CREATE\s+(?:UNIQUE\s+)?INDEX|DROP\s+INDEX)\b/i.test(statement)) {
    return { sql: normalized.sql, kind: 'ddl', readOnly: false };
  }

  throw new Error('Unsupported SQL statement. Use SELECT/VALUES, INSERT/UPDATE/DELETE, table DDL, or index DDL in the scoped editor.');
}

export function validateScopedFunctionBody(body: string): string {
  const normalized = String(body || '').trim();
  if (!normalized) throw new Error('Function body is required.');
  const scrubbed = scrubSingleQuotedStrings(normalized);
  if (/(?:--|\/\*|\*\/)/.test(scrubbed)) throw new Error('Function body comments are not accepted by the scoped Functions editor.');
  if (PROTECTED_RESOURCE.test(scrubbed) || SYSTEM_SCHEMA.test(scrubbed) || SYSTEM_RELATION.test(scrubbed) || DANGEROUS_FUNCTION.test(scrubbed) || PHYSICAL_SCHEMA_INTROSPECTION.test(scrubbed)) {
    throw new Error('Function body targets a protected BrisaBase or PostgreSQL system resource.');
  }
  if (/\b(?:EXECUTE|COPY|DO|CALL|GRANT|REVOKE|LISTEN|NOTIFY|LOAD)\b|\bSET\s+(?:ROLE|SESSION\s+AUTHORIZATION|search_path)\b|\b(?:CREATE|ALTER|DROP)\s+(?:DATABASE|ROLE|USER|SCHEMA|EXTENSION|SERVER|PUBLICATION|SUBSCRIPTION|FUNCTION|PROCEDURE|TRIGGER)\b/i.test(scrubbed)) {
    throw new Error('Function body contains an operation that is not permitted in the scoped Functions editor.');
  }
  if (/\b"?[A-Za-z_][A-Za-z0-9_]*"?\s*\.\s*"?[A-Za-z_][A-Za-z0-9_]*"?\s*\(/.test(scrubbed)) {
    throw new Error('Schema-qualified function calls are not accepted in project functions.');
  }
  if (/::\s*(?:regclass|regnamespace|regrole|regprocedure|regtype|regoperator)\b/i.test(scrubbed)) {
    throw new Error('PostgreSQL registry casts are not accepted in project functions.');
  }
  assertNoQualifiedExternalRelations(scrubbed);
  return normalized;
}
