/* eslint-disable no-console */
const { execFileSync } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const argument = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const output = path.resolve(argument('--output') || 'brisabase.cdx.json');

try {
  const command = process.platform === 'win32'
    ? [process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd sbom --sbom-format cyclonedx']]
    : ['npm', ['sbom', '--sbom-format', 'cyclonedx']];
  const raw = execFileSync(command[0], command[1], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const document = JSON.parse(raw);
  if (document.bomFormat !== 'CycloneDX' || !Array.isArray(document.components) || !document.components.length) throw new Error('npm returned an empty or invalid CycloneDX document.');
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log(`[BRISABASE] CycloneDX SBOM written to ${output} (${document.components.length} components).`);
} catch (error) {
  console.error(`[BRISABASE SBOM ERROR] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
