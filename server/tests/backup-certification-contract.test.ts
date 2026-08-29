import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync('server/routes/backup.ts', 'utf8');

assert.match(
  routeSource,
  /function requireRestoreCertification[\s\S]*recoveryCertificationStatus[\s\S]*BACKUP_RESTORE_NOT_CERTIFIED/,
  'Backup routes must expose a fail-closed recovery-evidence guard.',
);

const guardedCalls = [...routeSource.matchAll(/if \(!await requireRestoreCertification\(res\)\) return;/g)].length;
assert.equal(guardedCalls, 2, 'Both destructive restore entry points (snapshot restore and PITR) must require certification.');

const configProbe = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--input-type=module', '--eval', "const { config } = await import('./server/config.ts'); console.log(JSON.stringify({enabled:config.backup.enabled,certified:config.backup.certified}));"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      BACKUP_ENABLED: 'true',
      BACKUP_RESTORE_CERTIFIED: '',
    },
    encoding: 'utf8',
  },
);
assert.equal(configProbe.status, 0, configProbe.stderr);
assert.match(
  configProbe.stdout,
  /"enabled":true,"certified":false/,
  'Production backup creation may be enabled while destructive restore remains uncertified by default.',
);

const certifiedProbe = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--input-type=module', '--eval', "const { config } = await import('./server/config.ts'); console.log(JSON.stringify({enabled:config.backup.enabled,certified:config.backup.certified}));"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      BACKUP_ENABLED: 'true',
      BACKUP_RESTORE_CERTIFIED: 'true',
    },
    encoding: 'utf8',
  },
);
assert.equal(certifiedProbe.status, 0, certifiedProbe.stderr);
assert.match(
  certifiedProbe.stdout,
  /"enabled":true,"certified":true/,
  'The configuration flag must be available, while runtime restore additionally requires a passed drill.',
);

console.log('Backup certification contract passed: safe backup operations and destructive recovery are independently gated.');
