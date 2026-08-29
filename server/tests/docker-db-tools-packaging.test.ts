import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dockerfile = readFileSync('Dockerfile', 'utf8');
const runtimeStage = dockerfile.slice(dockerfile.indexOf('FROM ${NODE_RUNTIME_IMAGE} AS runtime'), dockerfile.indexOf('FROM runtime AS integration'));

for (const tool of ['migrate.cjs', 'status.cjs', 'admin-create.cjs']) {
  const source = readFileSync(`server/db/${tool}`, 'utf8');
  assert.match(source, /require\('\.\/pg-ssl-options\.cjs'\)/, `${tool} must use the shared PostgreSQL TLS helper.`);
  assert.match(runtimeStage, new RegExp(`COPY --from=build \/app\/server\/db\/${tool.replace('.', '\\.')} \.\/server\/db\/${tool.replace('.', '\\.')}`), `${tool} must be packaged in the runtime image.`);
}

assert.match(
  runtimeStage,
  /COPY --from=build \/app\/server\/db\/pg-ssl-options\.cjs \.\/server\/db\/pg-ssl-options\.cjs/,
  'Runtime image must package pg-ssl-options.cjs beside the database operator tools that require it.',
);

const migrateSource = readFileSync('server/db/migrate.cjs', 'utf8');
assert.match(migrateSource, /require\('\.\/legacy-compat\.cjs'\)/, 'migrate.cjs must retain the legacy migration compatibility bridge.');
assert.match(
  runtimeStage,
  /COPY --from=build \/app\/server\/db\/legacy-compat\.cjs \.\/server\/db\/legacy-compat\.cjs/,
  'Runtime image must package legacy-compat.cjs beside migrate.cjs.',
);

assert.match(
  runtimeStage,
  /COPY --from=build \/app\/node_modules\/esbuild \.\/node_modules\/esbuild/,
  'Control-plane runtime must package the lock-resolved esbuild compiler required by the server bundle.',
);
assert.match(
  runtimeStage,
  /COPY --from=build \/app\/node_modules\/@esbuild \.\/node_modules\/@esbuild/,
  'Control-plane runtime must package the esbuild platform binary required by the server bundle.',
);

const functionsDockerfile = readFileSync('Dockerfile.functions', 'utf8');
const executorSource = readFileSync('server/functions/executorServer.ts', 'utf8');
assert.match(executorSource, /from 'esbuild'/, 'Functions executor must explicitly declare its runtime compiler usage.');
assert.match(
  functionsDockerfile,
  /COPY --from=build \/app\/node_modules\/esbuild \.\/node_modules\/esbuild/,
  'Functions runtime must package the lock-resolved esbuild compiler without installing all dev dependencies.',
);
assert.match(
  functionsDockerfile,
  /COPY --from=build \/app\/node_modules\/@esbuild \.\/node_modules\/@esbuild/,
  'Functions runtime must package the esbuild platform binary beside the compiler package.',
);

console.log('Docker DB tools, control-plane runtime, and functions runtime packaging contract passed.');
