const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const entry = path.join(root, 'developer/cli/brisabase-entry.mjs');

function run(args, cwd = root) {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    shell: false,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

(async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.bin?.brisabase, './developer/cli/brisabase-entry.mjs');
  assert.equal(pkg.scripts?.cli, 'node developer/cli/brisabase-entry.mjs');

  const help = run(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Deployment & targets:/);
  assert.match(help.stdout, /deployment init \[profile\]/);
  assert.match(help.stdout, /up\s+Start Hobby \/ Local/);

  const deploymentHelp = run(['deployment', 'help']);
  assert.equal(deploymentHelp.status, 0, deploymentHelp.stderr);
  assert.match(deploymentHelp.stdout, /BrisaBase Deployment Profiles/);
  assert.match(deploymentHelp.stdout, /brisabase deployment init/);

  const temp = await mkdtemp(path.join(os.tmpdir(), 'brisabase-cli-onboarding-'));
  try {
    await writeFile(path.join(temp, 'brisabase.json'), `${JSON.stringify({ projectId: 'project-test', environmentId: 'env-test', url: 'http://localhost:3000' }, null, 2)}\n`, 'utf8');

    const add = run(['target', 'add', 'local', 'http://localhost:3000'], temp);
    assert.equal(add.status, 0, add.stderr);
    const targets = JSON.parse(await readFile(path.join(temp, 'brisabase.targets.json'), 'utf8'));
    assert.equal(targets.active, 'local');
    assert.equal(targets.targets.local.url, 'http://localhost:3000');

    const remoteHttp = run(['target', 'add', 'unsafe', 'http://example.com'], temp);
    assert.notEqual(remoteHttp.status, 0);
    assert.match(remoteHttp.stderr, /must use HTTPS/);

    const wrongUp = run(['up', 'enterprise'], temp);
    assert.notEqual(wrongUp.status, 0);
    assert.match(wrongUp.stderr, /always starts Hobby/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }

  process.stdout.write('cli deployment onboarding contract: ok\n');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
