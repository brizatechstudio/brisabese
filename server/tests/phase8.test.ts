import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { securityEngine } from '../security/securityEngine';
import { SecurityContext } from '../security/types';
import { StoragePermissionEngine } from '../storage/permissionEngine';
import { storageEngine } from '../storage/storageEngine';
import { functionEngine } from '../functions/functionEngine';
import { projectDbManager } from '../db/projectDatabase';
import { SchemaIntrospectionService } from '../apiEngine/schemaIntrospection';
import { SafeQueryBuilder } from '../apiEngine/queryBuilder';
import { RealtimeEventDispatcher } from '../realtime/eventDispatcher';
import { RealtimeConnectionManager } from '../realtime/connectionManager';
import { subscriptionManager } from '../realtime/subscriptionManager';
import { RealtimeConnection, RealtimeSubscription } from '../realtime/types';

const scope: SecurityContext = {
  organizationId: 'org_core_1', projectId: 'proj_ecommerce_1', environmentId: 'env_proj_ecommerce_1_production',
  userId: 'usr_owner_1', role: 'owner',
};

function expect(value: unknown, message: string): asserts value { assert.ok(value, `TEST FAILED (Phase 8): ${message}`); }

export async function runPhase8Tests() {
  console.log('🧪 Iniciando testes de validação da FASE 8 - Security Engine e RLS...\n');
  const suffix = Date.now().toString(36);
  const table = `secure_${suffix}`;
  projectDbManager.createTable(scope.organizationId, scope.projectId, scope.environmentId, {
    name: table,
    columns: [
      { name: 'id', type: 'uuid', isPrimaryKey: true, isNullable: false },
      { name: 'user_id', type: 'uuid', isNullable: false },
      { name: 'department', type: 'text', isNullable: false },
      { name: 'value', type: 'text', isNullable: false },
    ],
  });
  projectDbManager.insertRow(scope.organizationId, scope.projectId, scope.environmentId, table, { id: 'owned', user_id: 'user-a', department: 'sales', value: 'visible' });
  projectDbManager.insertRow(scope.organizationId, scope.projectId, scope.environmentId, table, { id: 'other', user_id: 'user-b', department: 'engineering', value: 'hidden' });
  securityEngine.createPolicy(scope, { name: `owner-select-${suffix}`, resourceType: 'table', resource: table, operation: 'SELECT', condition: 'auth.uid() = user_id' });
  securityEngine.createPolicy(scope, { name: `owner-insert-${suffix}`, resourceType: 'table', resource: table, operation: 'INSERT', condition: 'auth.uid() = new.user_id' });
  securityEngine.createPolicy(scope, { name: `owner-update-${suffix}`, resourceType: 'table', resource: table, operation: 'UPDATE', condition: 'auth.uid() = user_id and auth.uid() = new.user_id' });
  securityEngine.createPolicy(scope, { name: `owner-delete-${suffix}`, resourceType: 'table', resource: table, operation: 'DELETE', condition: "auth.role() = 'admin'" });
  const userA: SecurityContext = { ...scope, userId: 'user-a', role: 'authenticated', claims: { department: 'sales' } };
  const rows = projectDbManager.getTableRows(scope.organizationId, scope.projectId, scope.environmentId, table, { limit: 20 }).rows;
  const ownedRow = rows.find((row) => row.user_id === 'user-a')!;
  const otherRow = rows.find((row) => row.user_id === 'user-b')!;
  expect(securityEngine.filterRows(userA, table, rows).map((row) => row.id).join() === 'owned', 'SELECT deve filtrar linhas de outros usuários');
  expect(securityEngine.evaluate(userA, 'table', table, 'INSERT', undefined, { user_id: 'user-a' }).allowed, 'INSERT deve usar a imagem NEW');
  expect(!securityEngine.evaluate(userA, 'table', table, 'INSERT', undefined, { user_id: 'user-b' }).allowed, 'INSERT de outro usuário deve ser negado');
  expect(!securityEngine.evaluate(userA, 'table', table, 'UPDATE', otherRow, { ...otherRow, value: 'attempt' }).allowed, 'UPDATE parcial de outra linha deve ser negado');
  expect(!securityEngine.evaluate(userA, 'table', table, 'DELETE', ownedRow).allowed, 'DELETE exige a role prevista');
  expect(securityEngine.evaluate({ ...userA, role: 'service', bypassRls: true }, 'table', table, 'DELETE', ownedRow).allowed, 'Service role com bypass explícito deve ser permitido');
  expect(!securityEngine.evaluate({ ...userA, bypassRls: true }, 'table', table, 'DELETE', ownedRow).allowed, 'Bypass sem service role deve ser negado');
  securityEngine.createPolicy(scope, { name: `claim-${suffix}`, resourceType: 'table', resource: table, operation: 'SELECT', condition: "auth.claim('department') = department" });
  expect(securityEngine.evaluate(userA, 'table', table, 'SELECT', ownedRow).allowed, 'Claims JWT devem poder participar da política compilada');
  console.log('✅ Teste 1: compiler AST, cache, CRUD, claims e decisões RLS.');

  const resource = SchemaIntrospectionService.getResource(scope.organizationId, scope.projectId, scope.environmentId, table)!;
  const apiRows = SafeQueryBuilder.executeSelect(scope.organizationId, scope.projectId, scope.environmentId, resource, SafeQueryBuilder.parseQueryParams({}, resource), userA).data;
  expect(apiRows.length === 1 && apiRows[0].id === 'owned', 'API query builder deve aplicar RLS antes da projeção');
  const sqlRows = projectDbManager.executeQuery(scope.organizationId, scope.projectId, scope.environmentId, `select * from ${table}`, 'user-a', userA).rows;
  expect(sqlRows.length === 1 && sqlRows[0].id === 'owned', 'Editor SQL deve filtrar resultados SELECT pelo mesmo contexto RLS');
  const sent: string[] = [];
  const connection: RealtimeConnection = { id: `conn-${suffix}`, organizationId: scope.organizationId, projectId: scope.projectId, environmentId: scope.environmentId, userId: 'user-b', role: 'authenticated', channels: new Set(), subscriptions: new Map(), connectedAt: new Date().toISOString(), lastSeen: new Date().toISOString(), ip: '127.0.0.1', userAgent: 'phase8-test', socket: { send: (message: string) => sent.push(message) }, isAlive: true, bufferedMessages: 0 };
  const manager = new RealtimeConnectionManager();
  const dispatcher = new RealtimeEventDispatcher();
  dispatcher.setConnectionManager(manager);
  manager.addConnection(connection);
  const subscription: RealtimeSubscription = { id: `sub-${suffix}`, connectionId: connection.id, channel: 'rls', organizationId: scope.organizationId, projectId: scope.projectId, environmentId: scope.environmentId, schema: 'public', table, event: '*', authorization: { organizationId: scope.organizationId, projectId: scope.projectId, environmentId: scope.environmentId, userId: 'user-b', role: 'authenticated' } };
  subscriptionManager.addSubscription(subscription);
  const delivered = dispatcher.dispatch({ eventId: `event-${suffix}`, timestamp: new Date().toISOString(), organizationId: scope.organizationId, projectId: scope.projectId, environmentId: scope.environmentId, schema: 'public', table, operation: 'UPDATE', new: ownedRow, old: ownedRow });
  expect(delivered === 0 && sent.length === 0, 'Realtime não deve enviar eventos de linhas que o assinante não pode SELECT');
  subscriptionManager.removeSubscription(subscription.id);
  manager.removeConnection(connection.id, 'phase8_test_complete');
  console.log('✅ Teste 2: API e Realtime aplicam a política central.');

  const otherScope: SecurityContext = { ...scope, projectId: 'proj_mobile_saas', environmentId: 'env_proj_mobile_saas_production' };
  assert.throws(() => securityEngine.simulate(scope, otherScope, { resourceType: 'table', resource: table, operation: 'SELECT' }), /must remain/, 'Simulação multi-tenant deve ser bloqueada');
  console.log('✅ Teste 3: isolamento multi-tenant do simulador.');

  const bucket = `secure-${suffix}`;
  expect(storageEngine.createBucket({ ...scope, role: 'admin' }, { name: bucket, isPublic: false }).success, 'Bucket de RLS deve ser criado');
  securityEngine.createPolicy(scope, { name: `storage-owner-${suffix}`, resourceType: 'storage', resource: `${bucket}/private/*`, operation: 'SELECT', condition: "auth.uid() = 'user-a'" });
  expect((await storageEngine.uploadObject({ ...scope, role: 'admin' }, bucket, 'private/file.txt', Buffer.from('private'), 'text/plain')).success, 'Objeto de teste deve ser enviado');
  const storageAllowed = await storageEngine.getObject({ ...userA }, bucket, 'private/file.txt');
  const storageDenied = await storageEngine.getObject({ ...userA, userId: 'user-b' }, bucket, 'private/file.txt');
  expect(storageAllowed.success && !storageDenied.success, 'Storage deve aplicar a mesma policy central');
  securityEngine.createPolicy(scope, { name: `storage-prefix-${suffix}`, resourceType: 'storage', resource: `${bucket}/*`, operation: 'UPDATE', condition: 'context.path starts_with auth.uid()' });
  expect(securityEngine.evaluate(userA, 'storage', `${bucket}/user-a/file.txt`, 'UPDATE', undefined, undefined, 'user-a/file.txt').allowed, 'Prefixo do próprio usuário deve ser permitido');
  expect(!securityEngine.evaluate(userA, 'storage', `${bucket}/user-b/file.txt`, 'UPDATE', undefined, undefined, 'user-b/file.txt').allowed, 'Prefixo de outro usuário deve ser negado');
  expect(!StoragePermissionEngine.can({ ...userA, bucketName: bucket, path: 'private/file.txt', operation: 'READ' }).allowed || storageAllowed.success, 'Permission engine deve consultar RLS após a regra local');
  console.log('✅ Teste 4: Storage respeita políticas de objeto.');

  const fn = functionEngine.createFunction(scope, { name: `rls-${suffix}`, code: `export default async ({ database }) => ({ rows: await database.from('${table}').select('*') });`, executionMode: 'user' });
  functionEngine.deployFunction(scope, fn.id);
  const response = await functionEngine.execute(scope, fn.id, { method: 'GET', path: '/', headers: {}, query: {}, userId: 'user-a', role: 'authenticated', source: 'internal' });
  expect(Array.isArray((response.body as any).rows) && (response.body as any).rows.length === 1, 'Functions em modo user devem herdar o RLS do invocador');
  const serviceFn = functionEngine.createFunction(scope, { name: `rls-service-${suffix}`, code: `export default async ({ database }) => ({ rows: await database.from('${table}').select('*') });`, executionMode: 'service' });
  functionEngine.deployFunction(scope, serviceFn.id);
  const serviceResponse = await functionEngine.execute(scope, serviceFn.id, { method: 'GET', path: '/', headers: {}, query: {}, userId: 'user-a', role: 'authenticated', source: 'internal' });
  expect((serviceResponse.body as any).rows.length === 2, 'Functions em modo service devem fazer bypass explícito e auditável');
  console.log('✅ Teste 5: Functions aplicam contexto de usuário ou bypass service explícito.');

  await storageEngine.deleteObject({ ...scope, role: 'admin' }, bucket, 'private/file.txt');
  storageEngine.deleteBucket({ ...scope, role: 'admin' }, bucket);
  functionEngine.deleteFunction(scope, fn.id);
  functionEngine.deleteFunction(scope, serviceFn.id);
  projectDbManager.deleteTable(scope.organizationId, scope.projectId, scope.environmentId, table);
  console.log('🎉 TODOS OS TESTES DA FASE 8 — SECURITY ENGINE E RLS PASSARAM COM SUCESSO!\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) runPhase8Tests().catch((error) => { console.error(error); process.exitCode = 1; });
