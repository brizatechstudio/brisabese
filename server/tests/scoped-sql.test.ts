import assert from 'node:assert/strict';
import { prepareScopedSql, validateScopedFunctionBody } from '../db/scopedSql';

function expectReject(sql: string, pattern: RegExp): void {
  assert.throws(() => prepareScopedSql(sql), pattern);
}

console.log('DATABASE TOOLS - SCOPED SQL SAFETY');

{
  const prepared = prepareScopedSql(`CREATE TABLE IF NOT EXISTS notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL
  );`);
  assert.equal(prepared.kind, 'ddl');
  assert.equal(prepared.readOnly, false);
  assert.equal(prepared.sql.endsWith(';'), false);
  console.log('✓ trailing semicolon is accepted and table DDL stays scoped');
}

{
  const prepared = prepareScopedSql('SELECT t.id, t.title FROM notes t ORDER BY t.id DESC;');
  assert.equal(prepared.kind, 'read');
  assert.equal(prepared.readOnly, true);
  console.log('✓ read queries with normal table aliases remain supported');
}

{
  assert.equal(prepareScopedSql("INSERT INTO notes (title) VALUES ('hello') RETURNING id").kind, 'write');
  assert.equal(prepareScopedSql("UPDATE notes SET title='updated' WHERE id IS NOT NULL").kind, 'write');
  assert.equal(prepareScopedSql('DELETE FROM notes WHERE id IS NULL').kind, 'write');
  console.log('✓ scoped DML is accepted');
}

{
  assert.equal(prepareScopedSql('CREATE TABLE users (id uuid PRIMARY KEY)').kind, 'ddl');
  assert.equal(prepareScopedSql('CREATE TABLE sql_contract (id text PRIMARY KEY)').kind, 'ddl');
  assert.equal(prepareScopedSql('SELECT * FROM sql_contract').kind, 'read');
  console.log('✓ ordinary tenant names, including users and sql_ prefixes, are allowed');
}

expectReject('CREATE TABLE a(id int); DROP TABLE a;', /one SQL statement/i);
expectReject('SELECT * FROM pg_catalog.pg_roles', /protected/i);
expectReject('SELECT * FROM pg_roles', /protected/i);
expectReject('ALTER TABLE pg_authid ADD COLUMN unsafe text', /protected/i);
expectReject('CREATE INDEX idx_unsafe ON pg_class (oid)', /protected/i);
expectReject('TRUNCATE TABLE pg_authid', /protected/i);
expectReject('SELECT * FROM other_schema.customer', /Schema-qualified relations/i);
expectReject('GRANT SELECT ON notes TO public', /not permitted/i);
expectReject('CREATE EXTENSION pgcrypto', /not permitted/i);
expectReject('WITH deleted AS (DELETE FROM notes RETURNING *) SELECT * FROM deleted', /Data-changing CTEs/i);
expectReject('SELECT pg_read_file(\'/etc/passwd\')', /not permitted|protected/i);
expectReject("SELECT query_to_xml('SELECT * FROM public.users', true, false, '')", /not permitted/i);
expectReject("SELECT query_to_xmlschema('SELECT * FROM public.users', false, '')", /not permitted/i);
expectReject("SELECT nextval('public.control_sequence')", /not permitted/i);
expectReject("SELECT setval('public.control_sequence', 500)", /not permitted/i);
expectReject("SELECT has_database_privilege(current_database(), 'CREATE')", /not permitted/i);
expectReject('SELECT current_schema', /not permitted/i);
expectReject('SELECT current_schema()', /not permitted/i);
expectReject('SELECT current_schemas(true)', /not permitted/i);
expectReject("SELECT 'public.users'::regclass", /registry casts/i);
expectReject('CREATE TABLE copied AS SELECT * FROM notes', /CREATE TABLE AS\/LIKE/i);
console.log('✓ multi-statement, system catalogs/DDL, physical schema introspection, indirect SQL, sequences, cross-schema and privileged operations are blocked');

{
  const body = validateScopedFunctionBody(`BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;`);
  assert.match(body, /NEW\.updated_at/);
  console.log('✓ ordinary trigger function bodies are accepted');
}

assert.throws(() => validateScopedFunctionBody('BEGIN EXECUTE \'DROP TABLE notes\'; RETURN NEW; END;'), /not permitted/i);
assert.throws(() => validateScopedFunctionBody('BEGIN PERFORM pg_catalog.pg_sleep(10); RETURN NEW; END;'), /protected/i);
assert.throws(() => validateScopedFunctionBody('BEGIN PERFORM pg_sleep(10); RETURN NEW; END;'), /protected|not permitted/i);
assert.throws(() => validateScopedFunctionBody("BEGIN PERFORM nextval('public.control_sequence'); RETURN NEW; END;"), /protected|not permitted/i);
assert.throws(() => validateScopedFunctionBody('BEGIN PERFORM current_schema(); RETURN NEW; END;'), /protected|not permitted/i);
assert.throws(() => validateScopedFunctionBody('BEGIN UPDATE other_schema.notes SET title = \'x\'; RETURN NEW; END;'), /Schema-qualified relations/i);
console.log('✓ dynamic, system-schema, physical-schema, sequence and cross-schema function access are blocked');

console.log('SCOPED SQL SAFETY PASS');
