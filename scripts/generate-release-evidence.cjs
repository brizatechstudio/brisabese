/* eslint-disable no-console */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const output = path.resolve(projectRoot, process.argv[2] || 'artifacts/release-evidence.json');
const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

function git(...args) {
  return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8' }).trim();
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(projectRoot, file))).digest('hex');
}

const evidence = {
  schemaVersion: 1,
  product: pkg.name,
  version: pkg.version,
  commit: git('rev-parse', 'HEAD'),
  ref: process.env.GITHUB_REF || null,
  repository: process.env.GITHUB_REPOSITORY || null,
  workflowRunId: process.env.GITHUB_RUN_ID || null,
  generatedAt: new Date().toISOString(),
  runtime: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
  },
  checksums: {
    packageLock: sha256('package-lock.json'),
    sourceManifest: sha256('SOURCE_SHA256SUMS.txt'),
  },
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
console.log(`[BRISABASE] Release evidence written to ${path.relative(projectRoot, output)}.`);
