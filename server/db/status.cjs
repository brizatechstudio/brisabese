/* eslint-disable no-console */
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');
const { pgSslOptionsFromEnv } = require('./pg-ssl-options.cjs');
const { readCompatibleGlobalMigrationHistory } = require('./legacy-compat.cjs');

if (!process.env.DATABASE_URL) {
  console.error('[BRISABASE DATABASE ERROR] DATABASE_URL is required.');
  process.exit(1);
}


async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: pgSslOptionsFromEnv(process.env.DATABASE_URL) });
  await client.connect();
  try {
    const directory = path.join(__dirname, 'migrations');
    const files = (await fs.readdir(directory)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
    const applied = await readCompatibleGlobalMigrationHistory(client);
    if (applied.legacyPresent) console.log('INFO               predecessor migration history detected; db:migrate will upgrade it safely.');
    const byVersion = new Map(applied.rows.map((row) => [row.version, row]));
    let pending = 0; let mismatch = 0;
    for (const file of files) {
      const checksum = crypto.createHash('sha256').update(await fs.readFile(path.join(directory, file), 'utf8')).digest('hex');
      const row = byVersion.get(file);
      const state = !row ? 'PENDING' : row.checksum === checksum ? 'APPLIED' : 'CHECKSUM_MISMATCH';
      if (state === 'PENDING') pending += 1;
      if (state === 'CHECKSUM_MISMATCH') mismatch += 1;
      console.log(`${state.padEnd(18)} ${file}${row?.applied_at ? `  ${new Date(row.applied_at).toISOString()}` : ''}`);
    }
    if (mismatch) process.exitCode = 2;
    else if (pending) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error('[BRISABASE DATABASE ERROR]', error.message); process.exit(1); });
