import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { functionEngine } from '../functions/functionEngine';
import { FunctionOperationContext } from '../functions/types';
import { storageEngine } from '../storage/storageEngine';

const context: FunctionOperationContext = {
  organizationId: 'org_core_1', projectId: 'proj_ecommerce_1', environmentId: 'env_proj_ecommerce_1_production', userId: 'usr_owner_1', role: 'owner',
};

function expect(value: unknown, message: string): asserts value { assert.ok(value, `TEST FAILED (Phase 7): ${message}`); }

export async function runPhase7Tests() {
  console.log('🧪 Iniciando testes do engine legado de Functions para desenvolvimento local...\n');
  const name = `hello-${Date.now().toString(36)}`;
  const created = functionEngine.createFunction(context, {
    name,
    access: 'public',
    code: `export default async (req, ctx) => { ctx.logger.info('received', req.method); return { status: 201, body: { hello: 'BrisaBase', method: req.method } }; }`,
  });
  expect(created.status === 'draft' && created.currentVersion === null, 'Nova function deve iniciar como draft versionado');
  const deployed = functionEngine.deployFunction(context, created.id);
  expect(deployed.status === 'active' && deployed.currentVersion === 1, 'Deploy deve publicar a primeira versão');
  const hello = await functionEngine.execute(context, created.id, { method: 'POST', path: '/functions/v1/hello', headers: {}, query: {}, body: { ok: true }, role: 'anonymous', source: 'http' });
  expect(hello.status === 201 && (hello.body as any).method === 'POST', 'Runtime deve executar handler HTTP isolado');
  expect(functionEngine.listLogs(context, created.id).some((log) => log.message.includes('received')), 'console/logger deve ser registrado em logs');
  console.log('✅ Teste 1: runtime isolado, deploy e logs.');

  const version = functionEngine.updateFunction(context, created.id, { code: `export default async ({ secrets, database }) => ({ secretAvailable: Boolean(secrets.API_KEY), users: (await database.from('users').select('*')).length });` });
  expect(version.version === 2 && version.status === 'draft', 'Edição deve criar uma nova versão draft');
  functionEngine.setSecret(context, 'API_KEY', 'not-visible-in-control-plane');
  expect(functionEngine.listSecrets(context).every((secret: any) => !('encryptedValue' in secret)), 'Listagem de secrets nunca deve expor valor cifrado');
  functionEngine.deployFunction(context, created.id, 2);
  const withContext = await functionEngine.execute(context, created.id, { method: 'GET', path: '/', headers: {}, query: {}, role: 'authenticated', userId: 'usr_owner_1', source: 'internal' });
  expect((withContext.body as any).secretAvailable === true && (withContext.body as any).users > 0, 'Contexto deve integrar secrets e Database SDK');
  functionEngine.rollbackFunction(context, created.id, 1);
  expect(functionEngine.getFunctionDefinition(context, created.id)?.currentVersion === 1, 'Rollback deve reativar uma versão anterior');
  console.log('✅ Teste 2: versions, rollback, Secrets e Database SDK.');

  const storageBucket = `fn-${Date.now().toString(36)}`;
  expect(storageEngine.createBucket({ ...context, role: 'admin' }, { name: storageBucket, isPublic: false, allowedMimeTypes: ['text/plain'] }).success, 'Bucket de integração deve ser criado');
  const storageVersion = functionEngine.updateFunction(context, created.id, { code: `export default async ({ storage }) => { await storage.from('${storageBucket}').upload('result.txt', new TextEncoder().encode('from-function'), { contentType: 'text/plain' }); return { ok: true }; }` });
  functionEngine.deployFunction(context, created.id, storageVersion.version);
  const storageResult = await functionEngine.execute(context, created.id, { method: 'POST', path: '/', headers: {}, query: {}, role: 'service', source: 'internal' });
  expect((storageResult.body as any).ok && (await storageEngine.getObject({ ...context, role: 'service' }, storageBucket, 'result.txt')).success, 'Storage SDK deve usar o mesmo escopo do projeto');
  const realtimeVersion = functionEngine.updateFunction(context, created.id, { code: `export default async ({ realtime }) => ({ sent: (await realtime.broadcast('functions', 'function.ready', { ok: true })).sent });` });
  functionEngine.deployFunction(context, created.id, realtimeVersion.version);
  const realtimeResult = await functionEngine.execute(context, created.id, { method: 'POST', path: '/', headers: {}, query: {}, role: 'service', source: 'internal' });
  expect(typeof (realtimeResult.body as any).sent === 'number', 'Realtime SDK deve publicar pelo escopo da function');
  console.log('✅ Teste 3: Storage e Realtime SDKs integrados ao runtime.');

  const queueVersion = functionEngine.updateFunction(context, created.id, { code: `export default async (req) => ({ queued: req.body?.orderId || null });` });
  functionEngine.deployFunction(context, created.id, queueVersion.version);
  functionEngine.start();
  const job = functionEngine.enqueue(context, 'emails', created.id, { orderId: 'ord_1' }, { maxAttempts: 2, priority: 5 });
  await new Promise((resolve) => setTimeout(resolve, 700));
  const finished = functionEngine.listJobs(context, 'emails').find((item) => item.id === job.id);
  functionEngine.stop();
  expect(finished?.status === 'completed', 'Queue deve executar jobs em background');
  const cron = functionEngine.createCron(context, created.id, '*/5 * * * *');
  expect(functionEngine.listCrons(context, created.id).some((item) => item.id === cron.id), 'Cron deve validar e registrar agendamento');
  console.log('✅ Teste 4: Queue, job em background e Cron.');

  const timeoutFn = functionEngine.createFunction(context, { name: `timeout-${Date.now().toString(36)}`, code: `export default async () => await new Promise(() => {});`, limits: { timeoutMs: 5_000 }, access: 'internal' });
  functionEngine.deployFunction(context, timeoutFn.id);
  await assert.rejects(() => functionEngine.execute(context, timeoutFn.id, { method: 'GET', path: '/', headers: {}, query: {}, role: 'service', source: 'internal' }), /timed out/);
  expect(functionEngine.getMetrics(context, timeoutFn.id).timeouts === 1, 'Timeout deve ser contado em métricas');
  console.log('✅ Teste 5: timeout e métricas.');

  const sandboxFn = functionEngine.createFunction(context, { name: `sandbox-${Date.now().toString(36)}`, code: `export default async () => process.cwd();`, access: 'internal' });
  functionEngine.deployFunction(context, sandboxFn.id);
  await assert.rejects(() => functionEngine.execute(context, sandboxFn.id, { method: 'GET', path: '/', headers: {}, query: {}, role: 'service', source: 'internal' }), /prohibited/);
  console.log('✅ Teste 6: filtro local bloqueia exemplos básicos; isto não constitui fronteira de segurança.');

  await storageEngine.deleteObject({ ...context, role: 'admin' }, storageBucket, 'result.txt');
  storageEngine.deleteBucket({ ...context, role: 'admin' }, storageBucket);
  functionEngine.deleteFunction(context, created.id);
  functionEngine.deleteFunction(context, timeoutFn.id);
  functionEngine.deleteFunction(context, sandboxFn.id);
  console.log('🎉 TESTES LOCAIS DO ENGINE LEGADO CONCLUÍDOS; FUNCTIONS PERMANECEM DESABILITADAS EM PRODUÇÃO.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPhase7Tests().catch((error) => { console.error('❌ Erro nos testes da FASE 7:', error); process.exit(1); });
}
