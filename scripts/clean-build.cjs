const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const buildDirectory = path.resolve(projectRoot, 'dist');

if (path.dirname(buildDirectory) !== projectRoot || path.basename(buildDirectory) !== 'dist') {
  throw new Error(`Refusing to clean an unexpected build path: ${buildDirectory}`);
}

fs.rmSync(buildDirectory, { recursive: true, force: true });
