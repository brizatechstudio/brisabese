/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const clientDirectory = path.join(projectRoot, 'dist/client');
const indexPath = path.join(clientDirectory, 'index.html');
const maxInitialJavaScriptBytes = Number(process.env.BRISABASE_MAX_INITIAL_JS_KB || 500) * 1024;

if (!fs.existsSync(indexPath)) {
  console.error('[BRISABASE BUNDLE BUDGET] dist/client/index.html is missing. Build the client first.');
  process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js)["'][^>]*>/gi)].map((match) => match[1]);
if (scripts.length === 0) {
  console.error('[BRISABASE BUNDLE BUDGET] No initial JavaScript entry was found in dist/client/index.html.');
  process.exit(1);
}

let total = 0;
for (const source of scripts) {
  const relative = source.replace(/^\//, '');
  const file = path.resolve(clientDirectory, relative);
  if (!file.startsWith(clientDirectory + path.sep) || !fs.existsSync(file)) {
    console.error(`[BRISABASE BUNDLE BUDGET] Invalid or missing entry asset: ${source}`);
    process.exit(1);
  }
  total += fs.statSync(file).size;
}

const totalKb = Math.round((total / 1024) * 100) / 100;
const limitKb = maxInitialJavaScriptBytes / 1024;
if (total > maxInitialJavaScriptBytes) {
  console.error(`[BRISABASE BUNDLE BUDGET] Initial JavaScript is ${totalKb} KiB; limit is ${limitKb} KiB.`);
  process.exit(1);
}

console.log(`[BRISABASE] Initial JavaScript budget passed: ${totalKb} KiB / ${limitKb} KiB.`);
