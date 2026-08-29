/* eslint-disable no-console */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pgSslOptionsFromEnv } = require('../db/pg-ssl-options.cjs');

const names = [
  'BRISABASE_DEPLOYMENT_MODE', 'DATABASE_SSL', 'DATABASE_SSL_REJECT_UNAUTHORIZED',
  'DATABASE_SSL_CA_FILE', 'DATABASE_SSL_CERT_FILE', 'DATABASE_SSL_KEY_FILE', 'DATABASE_SSL_SERVERNAME',
];
const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'brisabase-pg-tls-'));

try {
  const ca = path.join(directory, 'server-ca.pem');
  const cert = path.join(directory, 'client-cert.pem');
  const key = path.join(directory, 'client-key.pem');
  fs.writeFileSync(ca, 'TEST-CA');
  fs.writeFileSync(cert, 'TEST-CERT');
  fs.writeFileSync(key, 'TEST-KEY');

  Object.assign(process.env, {
    BRISABASE_DEPLOYMENT_MODE: 'managed',
    DATABASE_SSL: 'true',
    DATABASE_SSL_REJECT_UNAUTHORIZED: 'true',
    DATABASE_SSL_CA_FILE: ca,
    DATABASE_SSL_CERT_FILE: cert,
    DATABASE_SSL_KEY_FILE: key,
    DATABASE_SSL_SERVERNAME: 'db.internal.example',
  });

  const tls = pgSslOptionsFromEnv('postgresql://app:secret@10.0.0.10:5432/brisabase');
  assert.equal(tls.rejectUnauthorized, true);
  assert.equal(tls.ca, 'TEST-CA');
  assert.equal(tls.cert, 'TEST-CERT');
  assert.equal(tls.key, 'TEST-KEY');
  assert.equal(tls.servername, 'db.internal.example');

  delete process.env.DATABASE_SSL_CERT_FILE;
  assert.throws(() => pgSslOptionsFromEnv('postgresql://app:secret@10.0.0.10:5432/brisabase'), /configured together/i);

  console.log('PostgreSQL TLS options contract passed.');
} finally {
  for (const name of names) {
    const value = previous[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  fs.rmSync(directory, { recursive: true, force: true });
}
