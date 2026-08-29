import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('server/db/realProjectDatabase.ts', 'utf8');

assert.match(
  source,
  /p\.prosrc AS definition/,
  'Functions UI must expose only the stored function body, not a schema-qualified CREATE FUNCTION statement.',
);
assert.doesNotMatch(
  source,
  /pg_get_functiondef\(p\.oid\) AS definition/,
  'Functions UI must not leak the physical tenant schema through pg_get_functiondef.',
);

console.log('Database function opacity contract passed.');
