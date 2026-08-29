/* eslint-disable no-console */
const crypto = require('node:crypto');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { Client } = require('pg');
const { pgSslOptionsFromEnv } = require('./pg-ssl-options.cjs');

const argument = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const slug = (value) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const id = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
const passwordHash = (value) => { const salt = crypto.randomBytes(16).toString('hex'); return `scrypt$${salt}$${crypto.scryptSync(value, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex')}`; };
const durationSeconds = (value, fallback) => {
  const match = /^(\d+)(s|m|h|d)?$/i.exec(String(value || fallback).trim());
  if (!match) throw new Error('JWT token lifetime must use a duration such as 15m or 30d.');
  const unit = (match[2] || 's').toLowerCase();
  const multiplier = unit === 'd' ? 86400 : unit === 'h' ? 3600 : unit === 'm' ? 60 : 1;
  return Number(match[1]) * multiplier;
};

async function input() {
  const supplied = { email: argument('--email'), password: argument('--password'), organization: argument('--organization'), project: argument('--project') || 'Default Project' };
  if (process.argv.includes('--password-stdin')) supplied.password = (await new Promise((resolve, reject) => { let value = ''; stdin.setEncoding('utf8'); stdin.on('data', (chunk) => { value += chunk; }); stdin.on('end', () => resolve(value.trim())); stdin.on('error', reject); })).trim();
  if (supplied.email && supplied.password && supplied.organization) return supplied;
  if (!stdin.isTTY) throw new Error('Use --email, --organization and --password-stdin in non-interactive mode.');
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    supplied.email ||= await prompt.question('Administrator email: ');
    supplied.organization ||= await prompt.question('Organization name: ');
    supplied.password ||= await prompt.question('Password (input is visible; prefer --password-stdin): ');
    return supplied;
  } finally { prompt.close(); }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const values = await input();
  const email = String(values.email || '').trim().toLowerCase();
  const organization = String(values.organization || '').trim();
  const project = String(values.project || '').trim();
  const password = String(values.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid email is required.');
  if (password.length < 12) throw new Error('Administrator password must contain at least 12 characters.');
  if (!organization || !slug(organization) || !project || !slug(project)) throw new Error('Organization and project names are required.');

  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: pgSslOptionsFromEnv(process.env.DATABASE_URL) });
  await client.connect();
  try {
    await client.query('BEGIN');
    const owner = await client.query(`SELECT u.email FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.role='owner' LIMIT 1`);
    if (owner.rowCount) throw new Error(`An organization owner already exists (${owner.rows[0].email}). Refusing to create another first administrator.`);
    const userId = id('usr'); const organizationId = id('org'); const projectId = id('proj'); const environmentId = id('env');
    const hashedPassword = passwordHash(password);
    await client.query('INSERT INTO users(id,email,name,status,role,password_hash,mfa_enabled) VALUES($1,$2,$3,$4,$5,$6,false)', [userId, email, email.split('@')[0], 'active', 'owner', hashedPassword]);
    await client.query('INSERT INTO organizations(id,name,slug,owner_id) VALUES($1,$2,$3,$4)', [organizationId, organization, slug(organization), userId]);
    await client.query('INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,$4)', [id('mem'), organizationId, userId, 'owner']);
    await client.query('INSERT INTO projects(id,organization_id,name,slug,region,status) VALUES($1,$2,$3,$4,$5,$6)', [projectId, organizationId, project, slug(project), process.env.DEFAULT_REGION || 'us-east-1', 'active']);
    await client.query('INSERT INTO project_environments(id,project_id,name,slug,type,status) VALUES($1,$2,$3,$4,$5,$6)', [environmentId, projectId, 'Production', 'production', 'production', 'active']);
    await client.query('INSERT INTO auth_users(id,project_id,environment_id,email,email_verified,display_name,password_hash,role,status,provider,user_metadata,app_metadata) VALUES($1,$2,$3,$4,true,$5,$6,$7,$8,$9,$10,$11)', [userId, projectId, environmentId, email, email.split('@')[0], hashedPassword, 'admin', 'active', 'email', '{}', '{}']);
    await client.query('INSERT INTO auth_settings(project_id,environment_id,require_email_verification,allow_signups,minimum_password_length,require_mfa,maximum_sessions,session_lifetime_seconds,jwt_access_lifetime_seconds,refresh_token_lifetime_seconds) VALUES($1,$2,false,true,12,false,10,$3,$4,$5)', [projectId, environmentId, durationSeconds(process.env.JWT_REFRESH_TOKEN_TTL, '30d'), durationSeconds(process.env.JWT_ACCESS_TOKEN_TTL, '15m'), durationSeconds(process.env.JWT_REFRESH_TOKEN_TTL, '30d')]);
    await client.query('COMMIT');
    console.log(JSON.stringify({ created: true, organizationId, projectId, environmentId, email }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined); throw error;
  } finally { await client.end(); }
}

main().catch((error) => { console.error('[BRISABASE ADMIN ERROR]', error.message); process.exit(1); });
