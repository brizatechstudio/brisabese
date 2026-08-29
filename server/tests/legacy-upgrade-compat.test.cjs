const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  LEGACY_GLOBAL_CHECKSUM_REWRITES,
  normalizeLegacyGlobalChecksum,
  readCompatibleGlobalMigrationHistory,
  migrateLegacyGlobalMigrationHistory,
  migrateLegacyProjectMigrationHistory,
} = require('../db/legacy-compat.cjs');

function result(rows = []) { return { rows, rowCount: rows.length }; }

class FakeClient {
  constructor() {
    this.globalLegacyExists = true;
    this.globalCurrentExists = false;
    this.globalLegacy = [
      { version: '001_init.sql', checksum: 'a'.repeat(64), applied_at: new Date('2026-08-01T00:00:00Z') },
      { version: '002_auth.sql', checksum: 'b'.repeat(64), applied_at: new Date('2026-08-02T00:00:00Z') },
    ];
    this.globalCurrent = new Map();
    this.projectLegacyExists = true;
    this.projectCurrentExists = false;
    this.projectLegacy = [
      { id: 'm1', version: '1', name: 'create_items', sql_up: 'CREATE TABLE items(id text)', sql_down: 'DROP TABLE items', applied_at: new Date('2026-08-03T00:00:00Z'), execution_time_ms: 7, status: 'applied', checksum: 'c'.repeat(64) },
    ];
    this.projectCurrent = new Map();
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(normalized)) return result();
    if (/pg_advisory_xact_lock/.test(normalized)) return result([{ pg_advisory_xact_lock: null }]);
    if (/information_schema\.tables/.test(normalized)) {
      const [, table] = params;
      const exists = table === 'backforge_schema_migrations' ? this.globalLegacyExists
        : table === '__backforge_migrations' ? this.projectLegacyExists
          : false;
      return result([{ exists }]);
    }
    if (/CREATE TABLE IF NOT EXISTS brisabase_schema_migrations/.test(normalized)) { this.globalCurrentExists = true; return result(); }
    if (/SELECT version, checksum, applied_at FROM backforge_schema_migrations/.test(normalized)) return result(this.globalLegacy.map((row) => ({ ...row })));
    if (/SELECT checksum FROM brisabase_schema_migrations WHERE version=\$1/.test(normalized)) {
      const row = this.globalCurrent.get(params[0]); return result(row ? [{ checksum: row.checksum }] : []);
    }
    if (/INSERT INTO brisabase_schema_migrations/.test(normalized)) {
      this.globalCurrent.set(params[0], { version: params[0], checksum: params[1], applied_at: params[2] }); return result();
    }
    if (/SELECT count\(\*\)::int AS count FROM backforge_schema_migrations$/.test(normalized)) return result([{ count: this.globalLegacy.length }]);
    if (/JOIN backforge_schema_migrations legacy USING\(version\)/.test(normalized)) {
      const count = this.globalLegacy.filter((row) => this.globalCurrent.get(row.version)?.checksum === row.checksum).length;
      return result([{ count }]);
    }
    if (/DROP TABLE backforge_schema_migrations/.test(normalized)) { this.globalLegacyExists = false; return result(); }

    if (/CREATE TABLE IF NOT EXISTS "bb_test"\."__brisabase_migrations"/.test(normalized)) { this.projectCurrentExists = true; return result(); }
    if (/FROM "bb_test"\."__backforge_migrations" ORDER BY/.test(normalized)) return result(this.projectLegacy.map((row) => ({ ...row })));
    if (/FROM "bb_test"\."__brisabase_migrations" WHERE id=\$1/.test(normalized)) {
      const row = this.projectCurrent.get(params[0]); return result(row ? [{ ...row }] : []);
    }
    if (/INSERT INTO "bb_test"\."__brisabase_migrations"/.test(normalized)) {
      const [id,version,name,sql_up,sql_down,applied_at,execution_time_ms,status,checksum] = params;
      this.projectCurrent.set(id, { id,version,name,sql_up,sql_down,applied_at,execution_time_ms,status,checksum }); return result();
    }
    if (/SELECT count\(\*\)::int AS count FROM "bb_test"\."__backforge_migrations"$/.test(normalized)) return result([{ count: this.projectLegacy.length }]);
    if (/JOIN "bb_test"\."__backforge_migrations" legacy USING\(id\)/.test(normalized)) {
      const count = this.projectLegacy.filter((row) => this.projectCurrent.has(row.id)).length; return result([{ count }]);
    }
    if (/DROP TABLE "bb_test"\."__backforge_migrations"/.test(normalized)) { this.projectLegacyExists = false; return result(); }

    throw new Error(`Unhandled fake SQL: ${normalized}`);
  }
}

async function main() {
  assert.equal(
    normalizeLegacyGlobalChecksum('001_initial_schema.sql', '529db2b1ac8af4fd8a9b5168a0918e42197bbbbfbf14200b0e02e742e2cfb060'),
    'd20d7835926f8130a515646d80ecf811f2fc6b32f9b44871f3c1d9cb0ebaf253',
    'known comment-only migration rename must translate to the current checksum',
  );
  assert.equal(
    normalizeLegacyGlobalChecksum('001_initial_schema.sql', 'f'.repeat(64)),
    'f'.repeat(64),
    'unknown checksums must never be silently rewritten',
  );
  for (const [legacyKey, currentChecksum] of LEGACY_GLOBAL_CHECKSUM_REWRITES) {
    const version = legacyKey.slice(0, legacyKey.indexOf(':'));
    const migrationPath = path.join(process.cwd(), 'server', 'db', 'migrations', version);
    const actual = crypto.createHash('sha256').update(fs.readFileSync(migrationPath)).digest('hex');
    assert.equal(actual, currentChecksum, `${version} changed after the compatibility checksum map was defined`);
  }

  const client = new FakeClient();
  const readable = await readCompatibleGlobalMigrationHistory(client);
  assert.equal(readable.legacyPresent, true);
  assert.equal(readable.rows.length, 2, 'db:status compatibility view must include predecessor migration history');
  const global = await migrateLegacyGlobalMigrationHistory(client, 1111901778, 1);
  assert.deepEqual(global, { migrated: 2, removedLegacy: true });
  assert.equal(client.globalCurrent.size, 2);
  assert.equal(client.globalLegacyExists, false);

  const project = await migrateLegacyProjectMigrationHistory(client, 'bb_test');
  assert.deepEqual(project, { migrated: 1, removedLegacy: true });
  assert.equal(client.projectCurrent.size, 1);
  assert.equal(client.projectLegacyExists, false);

  const conflict = new FakeClient();
  conflict.globalCurrent.set('001_init.sql', { version: '001_init.sql', checksum: 'z'.repeat(64), applied_at: new Date() });
  await assert.rejects(
    () => migrateLegacyGlobalMigrationHistory(conflict, 1111901778, 1),
    /checksum conflict/i,
  );
  assert.equal(conflict.globalLegacyExists, true, 'legacy global history must survive a checksum conflict');

  const projectConflict = new FakeClient();
  projectConflict.projectCurrent.set('m1', { ...projectConflict.projectLegacy[0], checksum: 'z'.repeat(64) });
  await assert.rejects(
    () => migrateLegacyProjectMigrationHistory(projectConflict, 'bb_test'),
    /migration conflict/i,
  );
  assert.equal(projectConflict.projectLegacyExists, true, 'legacy project history must survive a content conflict');

  console.log('legacy upgrade compatibility: PASS');
}

main().catch((error) => { console.error(error); process.exit(1); });
