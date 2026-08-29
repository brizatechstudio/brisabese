#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const legacyCli = fileURLToPath(new URL('./brisabase.mjs', import.meta.url));
const deploymentCli = fileURLToPath(new URL('../../scripts/deployment-profile.cjs', import.meta.url));
const targetCli = fileURLToPath(new URL('../../scripts/target.cjs', import.meta.url));

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.signal) {
    process.stderr.write(`brisabase: child command stopped by ${result.signal}.\n`);
    process.exitCode = 1;
    return false;
  }
  process.exitCode = result.status ?? 1;
  return process.exitCode === 0;
}

function deploymentHelp() {
  process.stdout.write(`\nDeployment & targets:\n  up                                      Start Hobby / Local (alias for deployment up hobby)\n  deployment init [profile]               Create a profile environment file\n  deployment doctor [profile]             Validate Docker and profile configuration\n  deployment up|down|status|logs [profile]\n  target add <name> <url>                  Save a local/HTTPS API target\n  target use <name>                        Switch brisabase.json to a target\n  target list | remove <name> | doctor [name]\n\nProfiles: hobby | self-hosted | enterprise\n`);
}

function main(args) {
  const [group, ...rest] = args;

  if (!group || ['help', '--help', '-h'].includes(group)) {
    const ok = run(legacyCli, args);
    if (ok) deploymentHelp();
    return;
  }

  if (group === 'deployment') {
    run(deploymentCli, rest.length ? rest : ['help']);
    return;
  }

  if (group === 'target') {
    run(targetCli, rest);
    return;
  }

  if (group === 'up') {
    if (rest.length) throw new Error('"brisabase up" always starts Hobby. Use "brisabase deployment up <profile>" for another profile.');
    run(deploymentCli, ['up', 'hobby']);
    return;
  }

  run(legacyCli, args);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`brisabase: ${error?.message || String(error)}\n`);
  process.exitCode = 1;
}
