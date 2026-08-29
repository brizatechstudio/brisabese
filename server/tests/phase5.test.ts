import { db } from '../db/database';
import { projectDbManager } from '../db/projectDatabase';
import { realtimeEngine } from '../realtime/realtimeEngine';
import { postgresCdc } from '../realtime/postgresCdc';
import { channelManager } from '../realtime/channelManager';
import { subscriptionManager } from '../realtime/subscriptionManager';
import { EventFilterEngine } from '../realtime/filters';
import { RealtimePermissionEngine } from '../realtime/authorization';
import { RealtimeCdcEvent, RealtimeSubscription } from '../realtime/types';
import { pathToFileURL } from 'node:url';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED (Phase 5): ${message}`);
  }
}

export async function runPhase5Tests() {
  console.log('🧪 Iniciando testes de validação da FASE 5 - Realtime Engine Real...\n');

  const orgId = 'org_core_1';
  const projId = 'proj_ecommerce_1';
  const envId = 'env_proj_ecommerce_1_production';

  // Test 1: Event Filtering - Schema/Table/Operation matching
  const sub: RealtimeSubscription = {
    id: 'sub_test_1',
    connectionId: 'conn_test_1',
    channel: 'products',
    organizationId: orgId,
    projectId: projId,
    environmentId: envId,
    schema: 'public',
    table: 'products',
    event: 'UPDATE',
  };

  const insertEvent: RealtimeCdcEvent = {
    eventId: 'evt_test_1',
    timestamp: new Date().toISOString(),
    organizationId: orgId,
    projectId: projId,
    environmentId: envId,
    schema: 'public',
    table: 'products',
    operation: 'INSERT',
    new: { id: '1', name: 'Test' },
    old: null,
  };

  const updateEvent: RealtimeCdcEvent = {
    eventId: 'evt_test_2',
    timestamp: new Date().toISOString(),
    organizationId: orgId,
    projectId: projId,
    environmentId: envId,
    schema: 'public',
    table: 'products',
    operation: 'UPDATE',
    new: { id: '1', name: 'Test Updated' },
    old: { id: '1', name: 'Test' },
  };

  const deleteEvent: RealtimeCdcEvent = {
    eventId: 'evt_test_3',
    timestamp: new Date().toISOString(),
    organizationId: orgId,
    projectId: projId,
    environmentId: envId,
    schema: 'public',
    table: 'products',
    operation: 'DELETE',
    new: null,
    old: { id: '1', name: 'Test' },
  };

  assert(EventFilterEngine.matches(sub, updateEvent) === true, 'Subscription UPDATE deve corresponder a evento UPDATE');
  assert(EventFilterEngine.matches(sub, insertEvent) === false, 'Subscription UPDATE NÃO deve corresponder a evento INSERT');
  assert(EventFilterEngine.matches(sub, deleteEvent) === false, 'Subscription UPDATE NÃO deve corresponder a evento DELETE');
  console.log('✅ Teste 1: Event Filtering (schema, tabela, operação) validado.');

  // Test 2: Column Filtering (price=gt.100)
  const filterSub: RealtimeSubscription = {
    ...sub,
    id: 'sub_test_2',
    filter: 'price=gt.100',
  };

  const expensiveEvent: RealtimeCdcEvent = {
    ...updateEvent,
    new: { id: '1', name: 'Notebook', price: 5000 },
  };
  const cheapEvent: RealtimeCdcEvent = {
    ...updateEvent,
    new: { id: '1', name: 'Mouse', price: 50 },
  };

  assert(EventFilterEngine.matches(filterSub, expensiveEvent) === true, 'Filtro price=gt.100 deve corresponder a preço 5000');
  assert(EventFilterEngine.matches(filterSub, cheapEvent) === false, 'Filtro price=gt.100 NÃO deve corresponder a preço 50');
  console.log('✅ Teste 2: Column Filtering (price=gt.100) validado.');

  // Test 3: Project & Environment Isolation
  const otherProjectSub: RealtimeSubscription = {
    ...sub,
    id: 'sub_test_3',
    projectId: 'proj_mobile_saas',
  };

  const otherEnvSub: RealtimeSubscription = {
    ...sub,
    id: 'sub_test_4',
    environmentId: 'env_proj_ecommerce_1_staging',
  };

  subscriptionManager.addSubscription(sub);
  subscriptionManager.addSubscription(otherProjectSub);
  subscriptionManager.addSubscription(otherEnvSub);

  const connectionsMap = new Map();
  const matches = subscriptionManager.getMatchingSubscriptions(updateEvent, connectionsMap);
  assert(matches.length === 0, 'Sem conexões ativas, nenhum match deve ser retornado');

  // Add a mock connection
  const mockConn = {
    id: 'conn_test_1',
    organizationId: orgId,
    projectId: projId,
    environmentId: envId,
    role: 'authenticated',
    channels: new Set(['products']),
    subscriptions: new Map(),
    connectedAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    ip: '127.0.0.1',
    userAgent: 'test',
    socket: null,
    isAlive: true,
    bufferedMessages: 0,
  };
  connectionsMap.set('conn_test_1', mockConn);

  const matchesWithConn = subscriptionManager.getMatchingSubscriptions(updateEvent, connectionsMap);
  assert(matchesWithConn.length === 1, 'Apenas a subscription do projeto/ambiente correto deve corresponder');
  assert(matchesWithConn[0].subscription.id === 'sub_test_1', 'Subscription correta deve ser encontrada');

  subscriptionManager.removeSubscription('sub_test_1');
  subscriptionManager.removeSubscription('sub_test_3');
  subscriptionManager.removeSubscription('sub_test_4');
  console.log('✅ Teste 3: Isolamento de Projeto e Ambiente validado.');

  // Test 4: Authorization - System schema blocking
  const authBlock = RealtimePermissionEngine.canSubscribe(projId, envId, 'auth', 'users', 'authenticated', '*');
  assert(authBlock.allowed === false, 'Inscrição em schema auth deve ser bloqueada');

  const systemBlock = RealtimePermissionEngine.canSubscribe(projId, envId, 'public', 'auth_users', 'authenticated', '*');
  assert(systemBlock.allowed === false, 'Inscrição em tabela auth_users deve ser bloqueada');

  const publicAllowed = RealtimePermissionEngine.canSubscribe(projId, envId, 'public', 'products', 'authenticated', '*');
  assert(publicAllowed.allowed === true, 'Inscrição em tabela pública products deve ser permitida');
  console.log('✅ Teste 4: Authorization e bloqueio de schemas/tabelas do sistema validado.');

  // Test 5: Payload Sanitization
  const sensitiveRecord = {
    id: '1',
    name: 'Test',
    password_hash: 'secret_hash',
    refresh_token: 'secret_token',
    mfa_secret: 'secret_mfa',
    api_secret: 'secret_api',
    email: 'test@example.com',
  };
  const sanitized = RealtimePermissionEngine.sanitizeRecord(sensitiveRecord)!;
  assert(sanitized.password_hash === undefined, 'password_hash deve ser removido');
  assert(sanitized.refresh_token === undefined, 'refresh_token deve ser removido');
  assert(sanitized.mfa_secret === undefined, 'mfa_secret deve ser removido');
  assert(sanitized.api_secret === undefined, 'api_secret deve ser removido');
  assert(sanitized.email === 'test@example.com', 'Campos normais devem ser preservados');
  console.log('✅ Teste 5: Sanitização de payload (campos sensíveis removidos) validado.');

  // Test 6: Channel Manager - Join/Leave/List
  channelManager.joinChannel(projId, envId, 'products', 'conn_test_1');
  channelManager.joinChannel(projId, envId, 'products', 'conn_test_2');
  channelManager.joinChannel(projId, envId, 'orders', 'conn_test_1');

  const channels = channelManager.listChannels(projId, envId);
  assert(channels.length === 2, 'Devem existir 2 canais ativos');
  const productsChannel = channels.find((c) => c.name === 'products');
  assert(productsChannel?.activeConnections === 2, 'Canal products deve ter 2 conexões');

  channelManager.leaveChannel(projId, envId, 'products', 'conn_test_2');
  const productsAfterLeave = channelManager.listChannels(projId, envId).find((c) => c.name === 'products');
  assert(productsAfterLeave?.activeConnections === 1, 'Canal products deve ter 1 conexão após leave');

  channelManager.removeConnectionFromAllChannels('conn_test_1');
  const channelsAfterCleanup = channelManager.listChannels(projId, envId);
  assert(channelsAfterCleanup.length === 0, 'Todos os canais devem ser limpos após disconnect');
  console.log('✅ Teste 6: Channel Manager (join, leave, cleanup) validado.');

  // Test 7: CDC Event Generation
  await postgresCdc.start();
  const store = projectDbManager.getOrCreateStore(orgId, projId, envId);
  store.tables.set('products', {
    name: 'products',
    schema: 'public',
    rowCount: 0,
    sizeBytes: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    columns: [{ name: 'id', type: 'uuid', isPrimaryKey: true }],
  });
  store.rows.set('products', []);

  const inserted = projectDbManager.insertRow(orgId, projId, envId, 'products', { name: 'Test Product' });
  assert(!!inserted.id, 'Inserção deve gerar registro com ID');

  const updated = projectDbManager.updateRow(orgId, projId, envId, 'products', inserted.id, { name: 'Updated Product' });
  assert(updated.name === 'Updated Product', 'Atualização deve alterar o nome');

  const deleted = projectDbManager.deleteRow(orgId, projId, envId, 'products', inserted.id);
  assert(deleted === true, 'Exclusão deve retornar true');

  const eventLog = realtimeEngine.getEventLog(projId, envId);
  assert(eventLog.length >= 3, 'Devem existir pelo menos 3 eventos CDC registrados (INSERT, UPDATE, DELETE)');
  assert(eventLog[0].event === 'DELETE', 'Último evento deve ser DELETE');
  assert(eventLog[1].event === 'UPDATE', 'Segundo evento deve ser UPDATE');
  assert(eventLog[2].event === 'INSERT', 'Primeiro evento deve ser INSERT');
  console.log('✅ Teste 7: CDC Event Generation (INSERT, UPDATE, DELETE) validado.');

  // Test 8: Event Ordering
  assert(eventLog[0].timestamp >= eventLog[1].timestamp, 'Eventos devem estar em ordem cronológica decrescente');
  assert(eventLog[1].timestamp >= eventLog[2].timestamp, 'Eventos devem estar em ordem cronológica decrescente');
  console.log('✅ Teste 8: Ordering de eventos CDC validado.');

  // Test 9: Event IDs (deduplicação)
  const eventIds = new Set(eventLog.map((e) => e.eventId));
  assert(eventIds.size === eventLog.length, 'Todos os eventIds devem ser únicos');
  console.log('✅ Teste 9: Event IDs únicos para deduplicação validado.');

  // Test 10: Realtime Publication Manager
  const pubManager = realtimeEngine.publicationManager;
  const defaultSettings = pubManager.getTableSettings(projId, envId, 'products');
  assert(defaultSettings.realtimeEnabled === true, 'Realtime deve estar habilitado por padrão');

  pubManager.setTableSettings(projId, envId, 'products', { realtimeEnabled: false });
  const disabledSettings = pubManager.getTableSettings(projId, envId, 'products');
  assert(disabledSettings.realtimeEnabled === false, 'Realtime deve ser desabilitado');

  pubManager.setTableSettings(projId, envId, 'products', { realtimeEnabled: true });
  console.log('✅ Teste 10: Realtime Publication Manager (configurações por tabela) validado.');

  // Test 11: Rate Limiting
  const rateLimiter = realtimeEngine.rateLimiter;
  const sizeCheck = rateLimiter.checkMessageSize({ data: 'x'.repeat(100) });
  assert(sizeCheck.allowed === true, 'Mensagem pequena deve ser permitida');

  const largeSizeCheck = rateLimiter.checkMessageSize({ data: 'x'.repeat(70 * 1024) });
  assert(largeSizeCheck.allowed === false, 'Mensagem > 64KB deve ser bloqueada');
  console.log('✅ Teste 11: Rate Limiting e limite de tamanho de mensagem validado.');

  // Test 12: Metrics
  const metrics = realtimeEngine.getMetrics();
  assert(metrics.totalEventsProcessed >= 3, 'Métricas devem registrar eventos processados');
  assert(metrics.activeConnections >= 0, 'Métricas de conexões ativas devem existir');
  console.log('✅ Teste 12: Métricas do Realtime Engine validado.');

  // Test 13: Health Check
  const status = await realtimeEngine.getStatus();
  assert(status.status === 'ok', 'Status do Realtime Engine deve ser ok');
  assert(status.websocket === true, 'WebSocket deve estar ativo');
  assert(status.cdc === true, 'CDC deve estar ativo');
  console.log('✅ Teste 13: Health Check do Realtime Engine validado.');

  // Test 14: Broadcast Manager
  const broadcastSent = realtimeEngine.broadcastManager.broadcast(projId, envId, 'products', 'test_event', { hello: 'world' });
  assert(broadcastSent === 0, 'Sem conexões ativas, broadcast deve retornar 0');
  console.log('✅ Teste 14: Broadcast Manager validado.');

  // Test 15: Presence Manager
  realtimeEngine.presenceManager.track(projId, envId, 'products', 'conn_test_1', 'usr_001', { name: 'João' });
  const presenceState = realtimeEngine.presenceManager.getPresenceState(projId, envId, 'products');
  assert(presenceState.length === 1, 'Presence deve ter 1 usuário');
  assert(presenceState[0].userId === 'usr_001', 'Presence deve conter o usuário correto');

  realtimeEngine.presenceManager.untrack(projId, envId, 'products', 'conn_test_1');
  const presenceAfterLeave = realtimeEngine.presenceManager.getPresenceState(projId, envId, 'products');
  assert(presenceAfterLeave.length === 0, 'Presence deve ser limpo após untrack');
  console.log('✅ Teste 15: Presence Manager (track, untrack, sync) validado.');

  // Test 16: Subscription Lifecycle
  subscriptionManager.addSubscription(sub);
  assert(subscriptionManager.getCount() === 1, 'Deve existir 1 subscription');
  subscriptionManager.removeConnectionSubscriptions('conn_test_1');
  assert(subscriptionManager.getCount() === 0, 'Subscriptions devem ser limpas após disconnect');
  console.log('✅ Teste 16: Subscription Lifecycle validado.');

  // Test 17: Cross-Project Isolation via CDC
  const otherProjEvent: RealtimeCdcEvent = {
    eventId: 'evt_cross_proj',
    timestamp: new Date().toISOString(),
    organizationId: orgId,
    projectId: 'proj_mobile_saas',
    environmentId: 'env_proj_mobile_saas_production',
    schema: 'public',
    table: 'products',
    operation: 'INSERT',
    new: { id: 'x' },
    old: null,
  };

  subscriptionManager.addSubscription(sub);
  const crossMatches = subscriptionManager.getMatchingSubscriptions(otherProjEvent, connectionsMap);
  assert(crossMatches.length === 0, 'Evento de outro projeto NÃO deve corresponder a subscription deste projeto');
  subscriptionManager.removeSubscription(sub.id);
  await postgresCdc.stop();
  await realtimeEngine.stop();
  console.log('✅ Teste 17: Isolamento cross-project via CDC validado.');

  console.log('🎉 TODOS OS TESTES DA FASE 5 — REALTIME ENGINE REAL PASSARAM COM SUCESSO!\n');
}

// Auto-execute if run directly with tsx
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPhase5Tests().catch((err) => {
    console.error('❌ Erro nos testes da FASE 5:', err);
    process.exit(1);
  });
}
