/* eslint-disable no-console */
const { Client } = require('pg');

async function main() {
  if (process.env.BRISABASE_CONFIRM_ROTATION !== 'REVOKE_ALL_SESSIONS') throw new Error('Set BRISABASE_CONFIRM_ROTATION=REVOKE_ALL_SESSIONS to acknowledge global logout.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' } : false });
  await client.connect();
  try {
    await client.query('BEGIN');
    const adminRefresh = await client.query('UPDATE admin_refresh_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE revoked_at IS NULL RETURNING id');
    const adminSessions = await client.query('UPDATE admin_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE revoked_at IS NULL RETURNING id');
    const userRefresh = await client.query('UPDATE auth_refresh_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE revoked_at IS NULL RETURNING id');
    const userSessions = await client.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()),updated_at=now() WHERE revoked_at IS NULL RETURNING id');
    await client.query('COMMIT');
    console.log(JSON.stringify({ revoked: { adminSessions: adminSessions.rowCount, adminRefreshTokens: adminRefresh.rowCount, userSessions: userSessions.rowCount, userRefreshTokens: userRefresh.rowCount } }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(`[BRISABASE SESSION REVOCATION ERROR] ${error instanceof Error ? error.message : String(error)}`); process.exit(1); });
