const fs = require('node:fs');

function databaseUrlUsesTls(urlValue) {
  try {
    const sslMode = new URL(urlValue || '').searchParams.get('sslmode')?.toLowerCase();
    return ['require', 'verify-ca', 'verify-full'].includes(sslMode || '');
  } catch {
    return false;
  }
}

function readPemFile(name) {
  const file = process.env[name];
  if (!file) return undefined;
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`${name} could not be read from ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function pgSslOptionsFromEnv(urlValue = process.env.DATABASE_URL || '') {
  const enabled = process.env.DATABASE_SSL === 'true'
    || process.env.BRISABASE_DEPLOYMENT_MODE === 'managed'
    || databaseUrlUsesTls(urlValue);

  if (!enabled) return false;

  const options = {
    rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  };
  const ca = readPemFile('DATABASE_SSL_CA_FILE');
  const cert = readPemFile('DATABASE_SSL_CERT_FILE');
  const key = readPemFile('DATABASE_SSL_KEY_FILE');
  if (Boolean(cert) !== Boolean(key)) {
    throw new Error('DATABASE_SSL_CERT_FILE and DATABASE_SSL_KEY_FILE must be configured together for PostgreSQL mTLS.');
  }
  if (ca) options.ca = ca;
  if (cert) options.cert = cert;
  if (key) options.key = key;
  if (process.env.DATABASE_SSL_SERVERNAME) options.servername = process.env.DATABASE_SSL_SERVERNAME;
  return options;
}

module.exports = { databaseUrlUsesTls, pgSslOptionsFromEnv };
