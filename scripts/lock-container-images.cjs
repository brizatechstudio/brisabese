/* eslint-disable no-console */
const { execFileSync } = require('node:child_process');

const images = {
  NODE_IMAGE: 'node:22.18.0-bookworm-slim',
  POSTGRES_IMAGE: 'postgres:16.10-alpine',
  REDIS_IMAGE: 'redis:7.4.5-alpine',
  MINIO_IMAGE: 'minio/minio:RELEASE.2025-04-22T22-12-26Z',
  MINIO_MC_IMAGE: 'minio/mc:RELEASE.2025-04-16T18-13-26Z',
  CADDY_IMAGE: 'caddy:2.10.2-alpine',
  MAILPIT_IMAGE: 'axllent/mailpit:v1.26',
};

function digest(reference) {
  const output = execFileSync('docker', ['buildx', 'imagetools', 'inspect', reference, '--format', '{{json .Manifest.Digest}}'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
  const parsed = JSON.parse(output);
  if (!/^sha256:[a-f0-9]{64}$/i.test(parsed)) throw new Error(`Registry did not return a valid digest for ${reference}.`);
  return parsed;
}

try {
  for (const [name, reference] of Object.entries(images)) console.log(`${name}=${reference}@${digest(reference)}`);
} catch (error) {
  console.error(`[BRISABASE IMAGE LOCK ERROR] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
