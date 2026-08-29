/* eslint-disable no-console */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const windows = process.platform === 'win32';
const command = windows ? 'powershell.exe' : 'bash';
const script = path.join(__dirname, windows ? 'run-docker-release-gates.ps1' : 'run-docker-release-gates.sh');
const args = windows
  ? ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script]
  : [script];

const result = spawnSync(command, args, { cwd: path.dirname(__dirname), stdio: 'inherit', env: process.env });
if (result.error) {
  console.error(`[BRISABASE RELEASE GATES] Unable to start ${command}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
