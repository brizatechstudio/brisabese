/* eslint-disable no-console */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const argument = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const output = path.resolve(argument('--output') || 'brisabase-production-secrets.env');
const secret = (bytes = 48) => crypto.randomBytes(bytes).toString('base64url');
const minioRootAccessKey = `bbroot_${crypto.randomBytes(12).toString('hex')}`;
const minioRootSecret = secret(36);
const minioAppAccessKey = `bbapp_${crypto.randomBytes(12).toString('hex')}`;
const minioAppSecret = secret(36);
const values = {
  JWT_SECRET: secret(),
  AUTH_ENCRYPTION_KEY: secret(),
  ADMIN_BOOTSTRAP_TOKEN: secret(),
  FUNCTIONS_EXECUTOR_TOKEN: secret(),
  BACKUP_ENCRYPTION_KEY: secret(),
  HOSTING_CADDY_ASK_TOKEN: secret(),
  BRISABASE_PITR_OPERATOR_TOKEN: secret(),
  BRISABASE_OPERATIONS_TOKEN: secret(),
  ALERT_WEBHOOK_TOKEN: secret(),
  POSTGRES_PASSWORD: secret(36),
  DATABASE_APP_PASSWORD: secret(36),
  REDIS_PASSWORD: secret(36),
  MINIO_ROOT_USER: minioRootAccessKey,
  MINIO_ROOT_PASSWORD: minioRootSecret,
  S3_ACCESS_KEY: minioAppAccessKey,
  S3_SECRET_KEY: minioAppSecret,
};

try {
  fs.writeFileSync(output, `${Object.entries(values).map(([name, value]) => `${name}=${value}`).join('\n')}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.chmodSync(output, 0o600);
  console.log(`[BRISABASE] Generated independent production secrets at ${output}. The file was created with mode 0600 and was not printed.`);
} catch (error) {
  console.error(`[BRISABASE SECRET GENERATION ERROR] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
