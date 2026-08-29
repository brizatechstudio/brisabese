import assert from 'node:assert/strict';
import { prepareScopedSql } from '../db/scopedSql';
import { encodeCsv, parseCsv } from '../db/databasePhase2';

assert.equal(prepareScopedSql('SELECT * FROM users LIMIT 10').readOnly, true);
assert.throws(() => prepareScopedSql('EXPLAIN SELECT * FROM users'), /dedicated EXPLAIN/);
assert.throws(() => prepareScopedSql('SELECT * FROM public.users'), /Schema-qualified relations/);
assert.throws(() => prepareScopedSql('CREATE EXTENSION pg_trgm'), /not permitted|Unsupported SQL/);
const parsed = parseCsv('name,notes\nAlice,"hello, world"\nBob,"line 1\nline 2"');
assert.deepEqual(parsed, [{ name:'Alice', notes:'hello, world' }, { name:'Bob', notes:'line 1\nline 2' }]);
assert.equal(encodeCsv([{name:'Alice',notes:'hello, world'}],['name','notes']), 'name,notes\nAlice,"hello, world"');
console.log('[database-phase2] PASS');
