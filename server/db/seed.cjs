/* eslint-disable no-console */
const crypto = require('node:crypto');
const { Client } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[BRISABASE DATABASE ERROR] DATABASE_URL is required.');
  process.exit(1);
}

const now = new Date().toISOString();
const hashApiKey = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO users(id, email, name, status, created_at, updated_at) VALUES ('usr_owner_1', 'owner@brisabase.local', 'BrisaBase Local Owner', 'active', $1, $1) ON CONFLICT (id) DO NOTHING`, [now]);
    await client.query(`INSERT INTO organizations(id, name, slug, owner_id, created_at, updated_at) VALUES ('org_local_1', 'BrisaBase Local', 'brisabase-local', 'usr_owner_1', $1, $1) ON CONFLICT (id) DO NOTHING`, [now]);
    await client.query(`INSERT INTO organization_members(id, organization_id, user_id, role, created_at, updated_at) VALUES ('mem_local_owner', 'org_local_1', 'usr_owner_1', 'owner', $1, $1) ON CONFLICT (id) DO NOTHING`, [now]);
    await client.query(`INSERT INTO projects(id, organization_id, name, slug, description, region, status, created_at, updated_at) VALUES ('proj_local_1', 'org_local_1', 'BrisaBase Local Project', 'brisabase-local-project', 'Optional local development seed.', 'us-east-1', 'active', $1, $1) ON CONFLICT (id) DO NOTHING`, [now]);
    await client.query(`INSERT INTO project_environments(id, project_id, name, slug, type, status, created_at, updated_at) VALUES ('env_proj_local_1_development', 'proj_local_1', 'Development', 'development', 'development', 'active', $1, $1) ON CONFLICT (id) DO NOTHING`, [now]);
    // This setting makes the seed useful for an isolated Docker integration run.
    // It does not create an administrator account or a user password.
    await client.query(`INSERT INTO auth_settings(project_id, environment_id, require_email_verification, allow_signups, minimum_password_length, require_mfa, maximum_sessions, session_lifetime_seconds, jwt_access_lifetime_seconds, refresh_token_lifetime_seconds) VALUES ('proj_local_1', 'env_proj_local_1_development', false, true, 12, false, 10, 2592000, 900, 2592000) ON CONFLICT (project_id, environment_id) DO UPDATE SET require_email_verification=false, allow_signups=true, minimum_password_length=12`);
    await client.query(`INSERT INTO api_keys(id, project_id, environment_id, name, type, key_prefix, key_hash, created_at) VALUES ('key_local_service', 'proj_local_1', 'env_proj_local_1_development', 'Local development service key', 'service', 'bb_srv_', $1, $2) ON CONFLICT (id) DO NOTHING`, [hashApiKey('bb_srv_local_development_only'), now]);
    await client.query('COMMIT');
    console.log('[BRISABASE] optional development seed complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[BRISABASE DATABASE ERROR]', error.message);
  process.exit(1);
});
