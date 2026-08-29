/* eslint-disable no-console */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(projectRoot, 'SOURCE_SHA256SUMS.txt');
const manifestName = 'SOURCE_SHA256SUMS.txt';
const mode = process.argv[2] || 'verify';

function sourceFiles() {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: projectRoot },
  );

  return output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((file) => file !== manifestName)
    .filter((file) => fs.statSync(path.join(projectRoot, file), { throwIfNoEntry: false })?.isFile())
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function checksum(file) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(projectRoot, file)))
    .digest('hex');
}

function assertSafeFileName(file) {
  if (/[\r\n]/.test(file)) {
    throw new Error(`Release manifests do not support line breaks in file names: ${JSON.stringify(file)}`);
  }
}

function expectedManifest() {
  return sourceFiles()
    .map((file) => {
      assertSafeFileName(file);
      return `${checksum(file)}  ${file}`;
    })
    .join('\n') + '\n';
}

function generate() {
  const content = expectedManifest();
  fs.writeFileSync(manifestPath, content, 'utf8');
  console.log(`[BRISABASE] Source manifest generated with ${content.trimEnd().split('\n').length} files.`);
}

function verify() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`${manifestName} is missing. Run npm run release:manifest:generate.`);
  }

  const actual = fs.readFileSync(manifestPath, 'utf8').replace(/\r\n/g, '\n');
  const expected = expectedManifest();
  if (actual === expected) {
    console.log(`[BRISABASE] Source manifest verified (${expected.trimEnd().split('\n').length} files).`);
    return;
  }

  const actualLines = new Set(actual.trimEnd().split('\n'));
  const expectedLines = new Set(expected.trimEnd().split('\n'));
  const stale = [...actualLines].filter((line) => !expectedLines.has(line)).slice(0, 20);
  const missing = [...expectedLines].filter((line) => !actualLines.has(line)).slice(0, 20);
  if (stale.length) console.error('Stale or unexpected entries:\n' + stale.join('\n'));
  if (missing.length) console.error('Missing or changed entries:\n' + missing.join('\n'));
  throw new Error(`${manifestName} does not match the current source tree. Run npm run release:manifest:generate.`);
}

try {
  if (mode === 'generate') generate();
  else if (mode === 'verify') verify();
  else throw new Error(`Unknown mode '${mode}'. Use generate or verify.`);
} catch (error) {
  console.error(`[BRISABASE SOURCE MANIFEST ERROR] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
