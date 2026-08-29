import React, { useEffect, useState } from 'react';
import { Activity, Clock3, HeartPulse, LineChart as LineChartIcon, Network, RotateCw, ShieldAlert } from 'lucide-react';
import { observabilityService } from '../services';
import { MetricCard } from '../components/common/MetricCard';

type Tab = 'Overview' | 'Logs' | 'Metrics' | 'Traces' | 'Alerts' | 'Health' | 'Performance' | 'Retention';
const tabs: Tab[] = ['Overview', 'Logs', 'Metrics', 'Traces', 'Alerts', 'Health', 'Performance', 'Retention'];

export const ObservabilityPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('Overview');
  const [overview, setOverview] = useState<any>({ metrics: {}, alerts: [], health: [] });
  const [logs, setLogs] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<{ points: any[]; summary: Record<string, any> }>({ points: [], summary: {} });
  const [traces, setTraces] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<{ rules: any[]; events: any[] }>({ rules: [], events: [] });
  const [health, setHealth] = useState<any[]>([]);
  const [retention, setRetention] = useState<any>({});
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const refresh = async () => {
    try {
      const [nextOverview, nextLogs, nextMetrics, nextTraces, nextAlerts, nextHealth, nextRetention] = await Promise.all([
        observabilityService.overview(), observabilityService.logs(search ? { search } : {}), observabilityService.metrics(), observabilityService.traces(), observabilityService.alerts(), observabilityService.health(), observabilityService.retention(),
      ]);
      setOverview(nextOverview); setLogs(nextLogs); setMetrics(nextMetrics); setTraces(nextTraces); setAlerts(nextAlerts); setHealth(nextHealth); setRetention(nextRetention); setError('');
    } catch (err: any) { setError(err.message || 'Não foi possível carregar a observabilidade.'); }
  };
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 10_000); return () => window.clearInterval(timer); }, []);

  const metric = (name: string) => overview.metrics?.[name]?.latest ?? 0;
  return <div className="space-y-6 pb-12">
    <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:flex-row sm:items-center"><div><h1 className="flex items-center gap-2 text-xl font-bold text-slate-100"><LineChartIcon className="h-5 w-5 text-purple-400" /> Observability & Telemetry</h1><p className="mt-1 text-xs text-slate-400">Logs, métricas, traces e saúde atualizados automaticamente a cada 10 segundos.</p></div><button onClick={() => void refresh()} className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"><RotateCw className="h-4 w-4" /> Atualizar</button></div>
    <div className="flex gap-2 overflow-x-auto border-b border-slate-800 pb-2">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${tab === item ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>{item}</button>)}</div>
    {error && <div className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">{error}</div>}
    {tab === 'Overview' && <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><MetricCard title="Requests" value={String(metric('api.requests'))} badge="live" badgeType="neutral" icon={Activity} /><MetricCard title="Latência API" value={`${metric('api.latency_ms')}ms`} badge="média" badgeType="neutral" icon={Clock3} /><MetricCard title="CPU" value={`${metric('platform.cpu_pct')}%`} badge="processo" badgeType="neutral" icon={Activity} /><MetricCard title="Memória RSS" value={`${Math.round(metric('platform.memory_rss_bytes') / 1024 / 1024)} MB`} badge="processo" badgeType="neutral" icon={Activity} /><MetricCard title="Erros" value={String(metric('api.errors'))} badge="4xx/5xx" badgeType="negative" icon={ShieldAlert} /><MetricCard title="Eventos Realtime" value={String(metric('realtime.events'))} badge="live" badgeType="positive" icon={Network} /></div><section className="grid gap-4 lg:grid-cols-2"><Panel title="Health"><HealthList health={overview.health || health} /></Panel><Panel title="Alertas abertos"><List empty="Nenhum alerta aberto." items={(overview.alerts || []).map((alert: any) => <div key={alert.id} className="rounded-md border border-amber-900/50 bg-amber-950/20 p-3 text-sm text-amber-200">{alert.ruleName}: {alert.value} / limite {alert.threshold}</div>)} /></Panel></section></>}
    {tab === 'Logs' && <Panel title="Log Explorer"><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void refresh(); }} placeholder="Buscar por evento, requestId ou texto" className="mb-4 w-full rounded-md border border-slate-700 bg-slate-950 p-2 text-sm text-white" /><List empty="Nenhum log no buffer." items={logs.map((log) => <div key={log.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-3 font-mono text-xs"><span className={log.level === 'error' ? 'text-red-300' : log.level === 'warning' ? 'text-amber-300' : 'text-emerald-300'}>{log.level}</span> <span className="text-slate-500">{log.service} · {log.requestId || 'sem request'}</span><p className="mt-1 text-slate-200">{log.message}</p></div>)} /></Panel>}
    {tab === 'Metrics' || tab === 'Performance' ? <Panel title={tab === 'Metrics' ? 'Métricas' : 'Performance profiler'}><List empty="Aguardando métricas." items={Object.entries(metrics.summary).map(([name, item]: [string, any]) => <div key={name} className="flex justify-between rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm"><span className="font-mono text-purple-300">{name}</span><span className="text-slate-300">último {item.latest} · média {item.average} · {item.count} pontos</span></div>)} /></Panel> : null}
    {tab === 'Traces' && <Panel title="Trace Explorer"><List empty="Nenhum trace disponível." items={traces.map((trace) => <div key={trace.traceId} className="rounded-md border border-slate-800 bg-slate-950/60 p-3"><p className="font-mono text-sm text-purple-300">{trace.traceId}</p><p className="text-sm text-white">{trace.name} · {trace.durationMs ?? 0}ms · {trace.status}</p><p className="mt-1 text-xs text-slate-500">{(trace.spans || []).map((span: any) => `${span.name} (${span.durationMs ?? 0}ms)`).join(' → ')}</p></div>)} /></Panel>}
    {tab === 'Alerts' && <Panel title="Alertas"><List empty="Nenhuma regra configurada." items={alerts.rules.map((rule) => <div key={rule.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">{rule.name}: {rule.metric} {rule.operator} {rule.threshold} <span className="text-slate-500">({rule.severity})</span></div>)} /></Panel>}
    {tab === 'Health' && <Panel title="Health checks"><HealthList health={health} /></Panel>}
    {tab === 'Retention' && <Panel title="Retenção"><pre className="overflow-x-auto rounded-md bg-slate-950 p-4 text-sm text-slate-300">{JSON.stringify(retention, null, 2)}</pre></Panel>}
  </div>;
};

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><h2 className="mb-4 font-semibold text-slate-100">{title}</h2><div className="space-y-3">{children}</div></section>;
const List: React.FC<{ empty: string; items: React.ReactNode[] }> = ({ empty, items }) => <>{items.length ? items : <p className="text-sm text-slate-500">{empty}</p>}</>;
const HealthList: React.FC<{ health: any[] }> = ({ health }) => <List empty="Nenhum health check executado." items={health.map((item) => <div key={item.service} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm"><span className="flex items-center gap-2 text-slate-200"><HeartPulse className="h-4 w-4 text-emerald-300" />{item.service}</span><span className={item.status === 'healthy' ? 'text-emerald-300' : item.status === 'degraded' ? 'text-amber-300' : 'text-red-300'}>{item.status} · {item.latencyMs}ms</span></div>)} />;
