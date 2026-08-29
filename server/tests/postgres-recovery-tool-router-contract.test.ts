import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dockerfile = readFileSync('Dockerfile', 'utf8');
const router = readFileSync('server/backup/postgres-tool-router.cjs', 'utf8');
const runtimeStage = dockerfile.slice(
  dockerfile.indexOf('FROM ${NODE_RUNTIME_IMAGE} AS runtime'),
  dockerfile.indexOf('FROM runtime AS integration'),
);

assert.match(runtimeStage, /postgresql-client-16\s+postgresql-client-18/, 'Runtime must package PostgreSQL 16 and 18 recovery clients.');
assert.match(runtimeStage, /postgres-tool-router\.cjs/, 'Runtime must package the recovery tool router.');
assert.match(runtimeStage, /\/usr\/local\/bin\/pg_dump/, 'pg_dump must be routed through the BrisaBase selector.');
assert.match(runtimeStage, /\/usr\/local\/bin\/pg_restore/, 'pg_restore must be routed through the BrisaBase selector.');

assert.match(router, /supportedMajors = new Set\(\[16, 18\]\)/, 'Recovery router must explicitly support the deployed PostgreSQL majors.');
assert.match(router, /SHOW server_version_num/, 'Recovery router must detect the target server major before invoking a tool.');
assert.match(router, /\/usr\/lib\/postgresql\/\$\{major\}\/bin\/\$\{tool\}/, 'Recovery router must dispatch to the exact server-major binary.');
assert.match(router, /PGPASSWORD/, 'Recovery router must rely on inherited libpq credentials rather than command-line passwords.');
assert.doesNotMatch(router, /--password/, 'Recovery router must never put a database password on the command line.');

console.log('PostgreSQL recovery tool routing contract passed: BrisaBase selects exact v16/v18 recovery binaries by server major.');
