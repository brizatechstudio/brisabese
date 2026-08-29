/* eslint-disable no-console */
// Upgrade-only compatibility bridge for the predecessor runtime.
// Keep legacy identifiers isolated here so product/runtime code stays BrisaBase-only.

const LEGACY_GLOBAL_MIGRATION_TABLE = 'backforge_schema_migrations';
const CURRENT_GLOBAL_MIGRATION_TABLE = 'brisabase_schema_migrations';
const LEGACY_PROJECT_MIGRATION_TABLE = '__backforge_migrations';
const CURRENT_PROJECT_MIGRATION_TABLE = '__brisabase_migrations';

// These five files changed comments only during the product rename. Accept only
// the exact predecessor checksum and rewrite it to the current checksum so an
// existing database is not forced to re-run an already-applied migration.
const LEGACY_GLOBAL_CHECKSUM_REWRITES = new Map([
  ['001_initial_schema.sql:529db2b1ac8af4fd8a9b5168a0918e42197bbbbfbf14200b0e02e742e2cfb060', 'd20d7835926f8130a515646d80ecf811f2fc6b32f9b44871f3c1d9cb0ebaf253'],
  ['002_real_local_extensions.sql:8898fc5f682f536ef5aaafcffcd93c484d75548ea18326aa73a381d0c32a1004', '55895b28d4668464090fd28c20d0d98d7aede906fa8b32bb72c2c567d03c779f'],
  ['007_functions_persistence.sql:9a15b6681c173667e5cccf0a73c5e7ce153a650c714876f0fe2a7c0b1cd5e58e', '518a90e43979308aa0b59cbe6eca36734938a97ad498420366e8b4d7d179aaa8'],
  ['011_admin_auth.sql:cad4b7c1290e3249622d6a0ea32d0da3fd40ed999e855f573c9bac8764f78e79', 'd83b3a4931de20d8a1ac0c32053345a28e02d44b4da294019b9135fdb3b3295e'],
  ['016_platform_completion.sql:8dd98d7a2f086563c33f40c3a24f51ec688ee4dc616f7be09cb86dd90dcd359c', 'a4b6c03f9911f8d73ee96239db3ccc967c52734796932bc64cf200cb2346591c'],
]);

function normalizeLegacyGlobalChecksum(version, checksum) {
  return LEGACY_GLOBAL_CHECKSUM_REWRITES.get(`${version}:${checksum}`) || checksum;
}

function assertIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Invalid PostgreSQL identifier: ${value}`);
  return `"${value}"`;
}

async function relationExists(client, schema, table) {
  const result = await client.query(
    'SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name=$2) AS exists',
    [schema, table],
  );
  return result.rows[0]?.exists === true;
}

async function readCompatibleGlobalMigrationHistory(client) {
  const currentExists = await relationExists(client, 'public', CURRENT_GLOBAL_MIGRATION_TABLE);
  const legacyExists = await relationExists(client, 'public', LEGACY_GLOBAL_MIGRATION_TABLE);
  const rowsByVersion = new Map();

  if (currentExists) {
    const current = await client.query(`SELECT version, checksum, applied_at FROM ${CURRENT_GLOBAL_MIGRATION_TABLE} ORDER BY version`);
    for (const row of current.rows) rowsByVersion.set(row.version, { ...row, checksum: normalizeLegacyGlobalChecksum(row.version, row.checksum) });
  }
  if (legacyExists) {
    const legacy = await client.query(`SELECT version, checksum, applied_at FROM ${LEGACY_GLOBAL_MIGRATION_TABLE} ORDER BY version`);
    for (const row of legacy.rows) {
      const normalized = normalizeLegacyGlobalChecksum(row.version, row.checksum);
      const existing = rowsByVersion.get(row.version);
      if (existing && existing.checksum !== normalized) throw new Error(`Legacy migration checksum conflict for ${row.version}.`);
      if (!existing) rowsByVersion.set(row.version, { ...row, checksum: normalized });
    }
  }
  return { rows: [...rowsByVersion.values()].sort((a, b) => String(a.version).localeCompare(String(b.version))), legacyPresent: legacyExists };
}

async function migrateLegacyGlobalMigrationHistory(client, lockNamespace, lockId) {
  await client.query(`CREATE TABLE IF NOT EXISTS ${CURRENT_GLOBAL_MIGRATION_TABLE} (version TEXT PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  if (!await relationExists(client, 'public', LEGACY_GLOBAL_MIGRATION_TABLE)) return { migrated: 0, removedLegacy: false };

  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [lockNamespace, lockId]);
    const legacy = await client.query(`SELECT version, checksum, applied_at FROM ${LEGACY_GLOBAL_MIGRATION_TABLE} ORDER BY version`);
    let migrated = 0;
    for (const row of legacy.rows) {
      const normalizedLegacyChecksum = normalizeLegacyGlobalChecksum(row.version, row.checksum);
      const current = await client.query(`SELECT checksum FROM ${CURRENT_GLOBAL_MIGRATION_TABLE} WHERE version=$1`, [row.version]);
      if (current.rowCount) {
        const normalizedCurrentChecksum = normalizeLegacyGlobalChecksum(row.version, current.rows[0].checksum);
        if (normalizedCurrentChecksum !== normalizedLegacyChecksum) {
          throw new Error(`Legacy migration checksum conflict for ${row.version}. Refusing to discard either history.`);
        }
        if (current.rows[0].checksum !== normalizedCurrentChecksum) {
          await client.query(`UPDATE ${CURRENT_GLOBAL_MIGRATION_TABLE} SET checksum=$2 WHERE version=$1`, [row.version, normalizedCurrentChecksum]);
        }
        continue;
      }
      await client.query(
        `INSERT INTO ${CURRENT_GLOBAL_MIGRATION_TABLE}(version, checksum, applied_at) VALUES($1,$2,$3)`,
        [row.version, normalizedLegacyChecksum, row.applied_at],
      );
      migrated += 1;
    }

    for (const row of legacy.rows) {
      const expected = normalizeLegacyGlobalChecksum(row.version, row.checksum);
      const verified = await client.query(`SELECT checksum FROM ${CURRENT_GLOBAL_MIGRATION_TABLE} WHERE version=$1`, [row.version]);
      if (!verified.rowCount || verified.rows[0].checksum !== expected) {
        throw new Error('Legacy migration history verification failed; legacy table was preserved.');
      }
    }

    await client.query(`DROP TABLE ${LEGACY_GLOBAL_MIGRATION_TABLE}`);
    await client.query('COMMIT');
    return { migrated, removedLegacy: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function migrateLegacyProjectMigrationHistory(client, schema) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1), $2)', [`brisabase-project-migrations:${schema}`, 1]);
  const schemaName = assertIdentifier(schema);
  const currentTable = `${schemaName}.${assertIdentifier(CURRENT_PROJECT_MIGRATION_TABLE)}`;
  const legacyTable = `${schemaName}.${assertIdentifier(LEGACY_PROJECT_MIGRATION_TABLE)}`;

  await client.query(`CREATE TABLE IF NOT EXISTS ${currentTable} (id varchar(64) primary key,version varchar(128) not null,name varchar(255) not null,sql_up text,sql_down text,applied_at timestamptz not null default now(),execution_time_ms integer not null,status varchar(16) not null,checksum varchar(64))`);
  if (!await relationExists(client, schema, LEGACY_PROJECT_MIGRATION_TABLE)) return { migrated: 0, removedLegacy: false };

  const legacy = await client.query(`SELECT id,version,name,sql_up,sql_down,applied_at,execution_time_ms,status,checksum FROM ${legacyTable} ORDER BY applied_at,id`);
  let migrated = 0;
  for (const row of legacy.rows) {
    const current = await client.query(`SELECT id,version,name,sql_up,sql_down,applied_at,execution_time_ms,status,checksum FROM ${currentTable} WHERE id=$1`, [row.id]);
    if (current.rowCount) {
      const existing = current.rows[0];
      const comparable = ['version', 'name', 'sql_up', 'sql_down', 'execution_time_ms', 'status', 'checksum'];
      const conflict = comparable.some((key) => String(existing[key] ?? '') !== String(row[key] ?? ''));
      if (conflict) throw new Error(`Legacy project migration conflict for ${row.id} in schema ${schema}. Legacy table was preserved.`);
      continue;
    }
    await client.query(
      `INSERT INTO ${currentTable}(id,version,name,sql_up,sql_down,applied_at,execution_time_ms,status,checksum) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [row.id,row.version,row.name,row.sql_up,row.sql_down,row.applied_at,row.execution_time_ms,row.status,row.checksum],
    );
    migrated += 1;
  }

  const legacyCount = Number((await client.query(`SELECT count(*)::int AS count FROM ${legacyTable}`)).rows[0]?.count || 0);
  const matchedCount = Number((await client.query(`SELECT count(*)::int AS count FROM ${currentTable} current JOIN ${legacyTable} legacy USING(id)`)).rows[0]?.count || 0);
  if (legacyCount !== matchedCount) throw new Error(`Legacy project migration verification failed in schema ${schema}; legacy table was preserved.`);

  await client.query(`DROP TABLE ${legacyTable}`);
  return { migrated, removedLegacy: true };
}

module.exports = {
  LEGACY_GLOBAL_MIGRATION_TABLE,
  LEGACY_PROJECT_MIGRATION_TABLE,
  CURRENT_GLOBAL_MIGRATION_TABLE,
  CURRENT_PROJECT_MIGRATION_TABLE,
  LEGACY_GLOBAL_CHECKSUM_REWRITES,
  normalizeLegacyGlobalChecksum,
  readCompatibleGlobalMigrationHistory,
  migrateLegacyGlobalMigrationHistory,
  migrateLegacyProjectMigrationHistory,
};
