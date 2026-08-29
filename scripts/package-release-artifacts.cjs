/* eslint-disable no-console */
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const artifactsDir = path.join(projectRoot, 'artifacts');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

fs.mkdirSync(artifactsDir, { recursive: true });

for (const packageDirectory of ['developer/cli', 'developer/sdk']) {
  const result = execFileSync(
    npm,
    ['pack', `./${packageDirectory}`, '--pack-destination', artifactsDir, '--json', '--offline'],
    { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const packed = JSON.parse(result);
  if (!Array.isArray(packed) || packed.length !== 1 || !packed[0]?.filename) {
    throw new Error(`npm pack returned an unexpected result for ${packageDirectory}.`);
  }
  console.log(`[BRISABASE] Packaged ${packageDirectory} as artifacts/${packed[0].filename}.`);
}

const checksumName = 'RELEASE_SHA256SUMS.txt';
const checksums = fs.readdirSync(artifactsDir)
  .filter((file) => file !== checksumName && fs.statSync(path.join(artifactsDir, file)).isFile())
  .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
  .map((file) => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(artifactsDir, file))).digest('hex')}  ${file}`)
  .join('\n') + '\n';
fs.writeFileSync(path.join(artifactsDir, checksumName), checksums, 'utf8');
console.log(`[BRISABASE] Release artifact checksums written to artifacts/${checksumName}.`);
