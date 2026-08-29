/* eslint-disable no-console */
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');
const { pgSslOptionsFromEnv } = require('./pg-ssl-options.cjs');
const { migrateLegacyGlobalMigrationHistory } = require('./legacy-compat.cjs');

const MIGRATION_LOCK_NAMESPACE = 1111901778;
const MIGRATION_LOCK_ID = 1;

const databaseUrl = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[BRISABASE DATABASE ERROR] DATABASE_MIGRATION_URL or DATABASE_URL is required.');
  process.exit(1);
}

function destructive(sql) {
  return /\bDROP\s+(?:TABLE|SCHEMA|DATABASE|INDEX|TYPE)\b|\bTRUNCATE\b|\bALTER\s+TABLE\b[\s\S]*?\bDROP\s+COLUMN\b/i.test(sql);
}


async function main() {
  const client = new Client({ connectionString: databaseUrl, ssl: pgSslOptionsFromEnv(databaseUrl) });
  await client.connect();
  try {
    const legacy = await migrateLegacyGlobalMigrationHistory(client, MIGRATION_LOCK_NAMESPACE, MIGRATION_LOCK_ID);
    if (legacy.removedLegacy) console.log(`[BRISABASE] migrated ${legacy.migrated} legacy migration history row(s).`);
    const directory = path.join(__dirname, 'migrations');
    const files = (await fs.readdir(directory)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
    for (const file of files) {
      const sql = await fs.readFile(path.join(directory, file), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT checksum FROM brisabase_schema_migrations WHERE version = $1', [file]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`Migration checksum mismatch: ${file}`);
        continue;
      }
      if (destructive(sql) && process.env.BRISABASE_ALLOW_DESTRUCTIVE_MIGRATIONS !== 'true') {
        throw new Error(`Migration ${file} contains a destructive operation. Set BRISABASE_ALLOW_DESTRUCTIVE_MIGRATIONS=true only after a verified backup and explicit review.`);
      }
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock($1, $2)', [MIGRATION_LOCK_NAMESPACE, MIGRATION_LOCK_ID]);
        const lockedExisting = await client.query('SELECT checksum FROM brisabase_schema_migrations WHERE version = $1', [file]);
        if (lockedExisting.rowCount) {
          if (lockedExisting.rows[0].checksum !== checksum) throw new Error(`Migration checksum mismatch: ${file}`);
          await client.query('COMMIT');
          continue;
        }
        await client.query(sql);
        await client.query('INSERT INTO brisabase_schema_migrations(version, checksum) VALUES($1, $2)', [file, checksum]);
        await client.query('COMMIT');
        console.log(`[BRISABASE] migration applied: ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[BRISABASE DATABASE ERROR]', error.message);
  process.exit(1);
});
