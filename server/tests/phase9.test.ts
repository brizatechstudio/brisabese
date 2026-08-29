import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { observability } from '../observability';
import { MetricsEngine } from '../observability/metrics';
import { sanitizeTelemetry } from '../observability/sanitizer';

function expect(value: unknown, message: string): asserts value { assert.ok(value, `TEST FAILED (Phase 9): ${message}`); }

export async function runPhase9Tests() {
  console.log('🧪 Iniciando testes de validação da FASE 9 - Observability & Telemetry...\n');
  const suffix = Date.now().toString(36);
  const context = { organizationId: 'org_core_1', projectId: 'proj_ecommerce_1', environmentId: 'env_proj_ecommerce_1_production', userId: 'usr_observability', service: 'test' };

  const sanitized = sanitizeTelemetry({ password: 'unsafe', nested: { accessToken: 'unsafe', safe: 'ok' } });
  expect(sanitized.password === '[REDACTED]' && sanitized.nested.accessToken === '[REDACTED]' && sanitized.nested.safe === 'ok', 'Sanitização deve remover credenciais recursivamente');
  const request = observability.beginRequest({ method: 'GET', path: '/api/database/tables', requestId: `req-${suffix}`, context });
  observability.run(request.context, () => observability.log('info', 'database.query', 'Query completed.', { apiKey: 'do-not-store', durationMs: 12 }));
  observability.endRequest(request.span, 200);
  const log = observability.listLogs({ requestId: `req-${suffix}` })[0];
  expect(log.traceId === request.context.traceId && log.metadata?.apiKey === '[REDACTED]', 'Logs devem manter correlação e nunca expor API keys');
  expect(observability.metrics.summary()['api.requests']?.count >= 1, 'Middleware de requisição deve gerar métrica de requests');
  console.log('✅ Teste 1: logs estruturados, sanitização e correlação request/trace.');

  const trace = observability.traces.startTrace(`phase9-${suffix}`, 'test', context);
  const span = observability.traces.startSpan('database.select', 'database', { password: 'hidden' }, { ...context, traceId: trace.traceId });
  observability.traces.endSpan(span);
  const completed = observability.traces.get(trace.traceId);
  expect(completed?.spans.length === 1 && completed.spans[0].status === 'ok' && completed.spans[0].metadata?.password === '[REDACTED]', 'Trace deve registrar árvore de spans sanitizada');
  console.log('✅ Teste 2: tracing distribuído e spans.');

  let received = 0;
  const unsubscribe = observability.bus.subscribe('metric', () => { received += 1; });
  const rule = observability.createAlert({ name: `High latency ${suffix}`, metric: `phase9.latency.${suffix}`, operator: '>', threshold: 100, severity: 'critical', channels: ['webhook'], enabled: true, ...context });
  observability.metric(rule.metric, 120, 'histogram', { route: '/test' }, context);
  unsubscribe();
  expect(received === 1 && observability.alerts.listEvents().some((event) => event.ruleId === rule.id), 'Event Bus deve acionar métricas e alertas');
  observability.alerts.remove(rule.id);
  console.log('✅ Teste 3: métricas, Event Bus e Alert Engine.');

  observability.health.register(`phase9-${suffix}`, async () => ({ status: 'healthy', details: { source: 'test' } }));
  const health = await observability.health.check(`phase9-${suffix}`);
  expect(health.status === 'healthy' && health.latencyMs >= 0, 'Health engine deve medir checks por serviço');
  const bounded = new MetricsEngine(() => 2);
  bounded.increment('one'); bounded.increment('two'); bounded.increment('three');
  expect(bounded.query({ limit: 10 }).length === 2, 'Buffers devem aplicar backpressure por limite de entradas');
  console.log('✅ Teste 4: health checks e buffers limitados.');

  const prom = observability.exporters.prometheus(observability.metrics.query({ limit: 10 }));
  const otlp = observability.exporters.otlp(observability.listLogs({ limit: 10 }), observability.traces.list({ limit: 10 }), observability.metrics.query({ limit: 10 }));
  expect(prom.includes('brisabase_') && Array.isArray((otlp as any).resourceLogs), 'Exportadores Prometheus e OTLP devem manter formatos abertos');
  const previous = observability.retention.get();
  observability.retention.set({ logsDays: 1, metricsDays: 1, tracesDays: 1, alertsDays: 1, maxEntries: 10_000 });
  expect(typeof observability.flushRetention().logs === 'number', 'Retention deve limpar buffers de forma configurável');
  observability.retention.set(previous);
  console.log('✅ Teste 5: exportação e retenção.');

  console.log('🎉 TODOS OS TESTES DA FASE 9 — OBSERVABILITY & TELEMETRY PASSARAM COM SUCESSO!\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) runPhase9Tests().catch((error) => { console.error(error); process.exitCode = 1; });
