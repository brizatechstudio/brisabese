import React, { useState, useEffect } from 'react';
import { MetricCard } from '../components/common/MetricCard';
import {
  Globe,
  Users,
  HardDrive,
  Activity,
  ShieldAlert,
  RefreshCw
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { monitoringService, logsService } from '../services';

export const DashboardPage: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h');
  const [metrics, setMetrics] = useState<any>(null);
  const [chartPoints, setChartPoints] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [currentMetrics, timeSeries, logs] = await Promise.all([
        monitoringService.getCurrentMetrics(),
        monitoringService.getTimeSeries(timeRange),
        logsService.listLogs('api', 'all', ''),
      ]);
      setMetrics(currentMetrics);
      setChartPoints(timeSeries.map((p: any) => ({
        time: new Date(p.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        requests: p.value,
        latency: p.value,
        cpuUsage: currentMetrics.cpuUsagePct,
        memoryUsage: currentMetrics.memoryUsagePct,
      })));
      setRecentLogs(logs.slice(0, 6));
    } catch (err: any) {
      setError(err.message || 'Não foi possível carregar os dados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeRange]);

  const storageBreakdown = [
    { name: 'Postgres DB', value: metrics?.storageUsedGb || 0, color: '#ff8f21' },
    { name: 'Storage Buckets', value: (metrics?.storageTotalGb || 0) - (metrics?.storageUsedGb || 0), color: '#ee4788' },
    { name: 'Livre', value: Math.max(0, 1024 - (metrics?.storageTotalGb || 0)), color: '#302d40' }
  ];

  if (error) {
    return (
      <div className="p-2 sm:p-6 md:p-8 flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-lg font-semibold text-slate-100">Não foi possível carregar os dados.</h2>
          <p className="text-sm text-slate-400 max-w-md">{error}</p>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-500 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-6 md:p-8 space-y-6 flex-1 overflow-x-hidden font-sans">
      {/* Header Row */}
      <div className="bb-panel flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 rounded-2xl px-6 py-5">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-fuchsia-300">Control plane</p>
          <h1 className="text-3xl font-bold text-white tracking-tight">Bem-vindo ao <span className="bb-gradient-text">BrisaBase</span></h1>
          <p className="text-slate-400 text-sm">Resumo de métricas e performance em tempo real.</p>
        </div>

        {/* Time Filter Pill */}
        <div className="flex bg-black/20 rounded-xl p-1 border border-white/[0.08]">
          <button
            onClick={() => setTimeRange('24h')}
            className={`px-3 py-1 text-[10px] font-medium rounded transition-all ${
              timeRange === '24h'
                ? 'bg-white/[0.1] text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Últimas 24h
          </button>
          <button
            onClick={() => setTimeRange('7d')}
            className={`px-3 py-1 text-[10px] font-medium rounded transition-all ${
              timeRange === '7d'
                ? 'bg-white/[0.1] text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            7 dias
          </button>
          <button
            onClick={() => setTimeRange('7d')}
            className="px-3 py-1 text-[10px] font-medium text-slate-500 hover:text-slate-300"
          >
            30 dias
          </button>
        </div>
      </div>

      {/* Top Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="API Requests"
          value={loading ? '...' : metrics ? String(Math.round(metrics.requestsPerSec * 3600)) : '0'}
          subtext="requisições/hora"
          badge={loading ? '...' : metrics ? '▲ Em tempo real' : '—'}
          badgeType="positive"
          accentColor="purple"
          icon={Globe}
        />
        <MetricCard
          title="Active Users"
          value={loading ? '...' : metrics ? String(Math.round(metrics.requestsPerSec * 10)) : '0'}
          subtext="estimado"
          badge={loading ? '...' : metrics ? '● Ativo' : '—'}
          badgeType="neutral"
          accentColor="blue"
          icon={Users}
        />
        <MetricCard
          title="Total Storage"
          value={loading ? '...' : metrics ? `${metrics.storageUsedGb.toFixed(1)} GB` : '0 GB'}
          subtext={metrics ? `${((metrics.storageUsedGb / Math.max(metrics.storageTotalGb, 1)) * 100).toFixed(0)}% usado` : '—'}
          badge={loading ? '...' : metrics ? '● Estável' : '—'}
          badgeType="neutral"
          accentColor="cyan"
          icon={HardDrive}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Performance Throughput Card */}
        <div className="bb-panel lg:col-span-2 rounded-2xl p-6 flex flex-col h-[340px]">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Performance Throughput</h3>
              <p className="text-[11px] text-slate-500">Request response latency across regions.</p>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1.5 text-slate-400">
                <div className="w-2 h-2 rounded-full bg-orange-400"></div> Requests
              </span>
            </div>
          </div>

          <div className="flex-1 w-full min-h-0">
            {chartPoints.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartPoints}>
                  <defs>
                    <linearGradient id="brisabaseThroughput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e44393" stopOpacity={0.66} />
                      <stop offset="95%" stopColor="#7c43e7" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#64748B" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#151524', borderColor: '#4a405f', borderRadius: '12px', fontSize: '11px', color: '#F8FAFC' }} />
                  <Area type="monotone" dataKey="requests" stroke="#ec4a9d" strokeWidth={2.5} fillOpacity={1} fill="url(#brisabaseThroughput)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-slate-500">No data available</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity Card */}
        <div className="bb-panel rounded-2xl flex flex-col h-[340px]">
          <div className="p-6 h-full flex flex-col">
            <h3 className="text-sm font-semibold text-white mb-1">Recent Activity</h3>
            <p className="text-[11px] text-slate-500 mb-4">Live system events stream</p>

            <div className="flex-1 space-y-4 overflow-y-auto pr-1">
              {recentLogs.length > 0 ? recentLogs.map((log: any, idx: number) => (
                <div key={log.id || idx} className="flex gap-3 text-xs">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    log.level === 'error' ? 'bg-red-500 shadow-sm shadow-red-500/50' :
                    log.level === 'warn' ? 'bg-amber-500' :
                    log.level === 'info' ? 'bg-blue-500' : 'bg-slate-600'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-200">{log.message || log.event}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : '—'}
                    </p>
                  </div>
                </div>
              )) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm text-slate-500">No recent activity</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Additional Secondary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latency Bar Chart */}
        <div className="bb-panel rounded-2xl p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-white/[0.08] pb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Latência de Resposta (ms)</h3>
              <p className="text-[11px] text-slate-500">Média de tempo de processamento por horário</p>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Avg: {metrics ? `${metrics.avgLatencyMs}ms` : '—'}
            </span>
          </div>

          <div className="h-44 w-full">
            {chartPoints.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartPoints}>
                  <XAxis dataKey="time" stroke="#64748B" fontSize={10} />
                  <YAxis stroke="#64748B" fontSize={10} />
                  <Tooltip contentStyle={{ backgroundColor: '#151524', borderColor: '#4a405f', borderRadius: '12px', fontSize: '11px', color: '#F8FAFC' }} />
                  <Bar dataKey="latency" fill="#b744dd" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-slate-500">No data available</p>
              </div>
            )}
          </div>
        </div>

        {/* Storage Pie Distribution */}
        <div className="bb-panel rounded-2xl p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-white/[0.08] pb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Alocação de Storage</h3>
              <p className="text-[11px] text-slate-500">Distribuição entre banco e buckets</p>
            </div>
            <span className="text-[10px] text-cyan-400 font-mono bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
              {metrics ? `${metrics.storageUsedGb.toFixed(1)} GB` : '—'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-4">
            <div className="h-36 w-full">
              {metrics ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={storageBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={4}>
                      {storageBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#151524', borderColor: '#4a405f', borderRadius: '12px', fontSize: '11px', color: '#F8FAFC' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm text-slate-500">No data available</p>
                </div>
              )}
            </div>

            <div className="space-y-2 text-xs">
              {metrics ? storageBreakdown.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></span>
                    <span className="text-xs">{item.name}</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">{item.value.toFixed(1)} GB</span>
                </div>
              )) : (
                <p className="text-sm text-slate-500 text-center">No data available</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
