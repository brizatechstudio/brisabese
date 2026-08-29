const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const { compareSemVer, isSemVerAtLeast, parseSemVer } = require('../../scripts/semver.cjs');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const cliPackage = JSON.parse(read('developer/cli/package.json'));
const sdkPackage = JSON.parse(read('developer/sdk/package.json'));

assert.equal(pkg.version, '1.0.1-beta.1');
assert.equal(lock.version, pkg.version);
assert.equal(lock.packages[''].version, pkg.version);
assert.equal(lock.packages[''].bin.brisabase, 'developer/cli/brisabase-entry.mjs');
assert.equal(cliPackage.version, pkg.version);
assert.equal(sdkPackage.version, pkg.version);
assert.match(read('developer/cli/brisabase.mjs'), /const VERSION = '1\.0\.1-beta\.1';/);

assert.deepEqual(parseSemVer('1.0.1-beta.1+gate.7')?.prerelease, ['beta', '1']);
assert.equal(parseSemVer('1.0.1-01'), null, 'Numeric prerelease identifiers with leading zeroes must be rejected.');
assert.equal(compareSemVer('1.0.1-beta.1', '1.0.1'), -1);
assert.equal(isSemVerAtLeast(pkg.version, '1.0.0'), true, 'The beta candidate must remain newer than the Phase 8 baseline.');
assert.equal(isSemVerAtLeast('0.3.0-beta.1', '0.3.0'), false, 'A prerelease of a phase baseline must not satisfy the stable baseline.');
for (let phase = 1; phase <= 8; phase += 1) {
  assert.match(read(`scripts/verify-phase${phase}.cjs`), /isSemVerAtLeast/, `Phase ${phase} must use the prerelease-safe SemVer comparator.`);
}

assert.equal(pkg.scripts['release:manifest:generate'], 'node scripts/release-source-manifest.cjs generate');
assert.equal(pkg.scripts['release:manifest:verify'], 'node scripts/release-source-manifest.cjs verify');
assert.equal(pkg.scripts['release:evidence'], 'node scripts/generate-release-evidence.cjs');
assert.equal(pkg.scripts['release:package'], 'node scripts/package-release-artifacts.cjs');
assert.match(pkg.scripts.build, /check-bundle-budget\.cjs/, 'Production build must enforce the initial JavaScript budget.');

const productionGate = read('.github/workflows/brisabase-production-gate.yml');
assert.match(productionGate, /push:\s*\n\s+branches: \[main\]/, 'Production gate must run for every main SHA.');
assert.match(productionGate, /npm run release:manifest:verify/, 'Production gate must verify source integrity.');
assert.match(productionGate, /npm run release:validate:docker/, 'Production gate must run Docker release certification.');
assert.match(productionGate, /if: always\(\)/, 'Production gate must retain evidence after failures.');
assert.match(productionGate, /brisabase-release-evidence-\$\{\{ github\.sha \}\}/, 'Evidence must be named by immutable commit SHA.');

for (const file of ['scripts/run-docker-release-gates.sh', 'scripts/run-docker-release-gates.ps1']) {
  const script = read(file);
  assert.match(script, /npm run test:browser/, `${file} must execute the complete Playwright matrix.`);
  assert.doesNotMatch(script, /playwright test e2e\/admin-ui-smoke\.spec\.ts --project=desktop/, `${file} must not certify only desktop smoke.`);
  assert.match(script, /container-images\.txt/, `${file} must preserve immutable image evidence.`);
}

const playwright = read('playwright.config.ts');
for (const project of ['desktop', 'tablet', 'mobile']) assert.match(playwright, new RegExp(`name: '${project}'`));
assert.match(playwright, /globalSetup: '\.\/e2e\/global-setup\.ts'/, 'Browser certification must initialize one shared release session.');
assert.match(playwright, /workers: process\.env\.CI \? 1 : undefined/, 'Stateful browser certification must be serialized in CI.');
for (const spec of ['admin-ui-smoke.spec.ts', 'public-auth-smoke.spec.ts', 'user-password-reset.spec.ts']) {
  assert.match(playwright, new RegExp(spec.replaceAll('.', '\\.')), `${spec} must run in the responsive tablet/mobile matrix.`);
}
assert.match(playwright, /trace: 'retain-on-failure'/, 'Failed browser tests must retain a trace.');
assert.match(playwright, /video: 'retain-on-failure'/, 'Failed browser tests must retain video evidence.');
assert.match(read('e2e/global-setup.ts'), /resetReleaseAdminCache/, 'Each browser run must discard stale release credentials.');
assert.match(read('e2e/helpers/releaseAdmin.ts'), /SESSION_FILE/, 'Browser workers must reuse the isolated release session without repeated logins.');

assert.match(read('SECURITY.md'), /security\/advisories\/new/);
assert.match(read('public/.well-known/security.txt'), /^Contact: https:\/\//m);
assert.match(read('public/.well-known/security.txt'), /^Expires: /m);

console.log('Release readiness contract: PASS');
