import React, { useState, useEffect } from 'react';
import { MetricCard } from '../components/common/MetricCard';
import {
  LineChart as LineChartIcon,
  Activity,
  Cpu,
  HardDrive,
  Globe,
  Clock,
  ShieldAlert,
  RefreshCw
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area
} from 'recharts';
import { monitoringService } from '../services';

export const MonitoringPage: React.FC = () => {
  const [range, setRange] = useState<'24h' | '7d'>('24h');
  const [metrics, setMetrics] = useState<any>(null);
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [currentMetrics, timeSeries] = await Promise.all([
        monitoringService.getCurrentMetrics(),
        monitoringService.getTimeSeries(range),
      ]);
      setMetrics(currentMetrics);
      setData(timeSeries.map((p: any) => ({
        time: new Date(p.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        cpuUsage: Number(p.value || 0),
        memoryUsage: Number(p.value || 0),
      })));
    } catch (err: any) {
      setError(err.message || 'Não foi possível carregar os dados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [range]);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
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
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <LineChartIcon className="w-5 h-5 text-purple-400" />
            Telemetry & Infra Monitoring
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Monitoramento em tempo real do consumo de hardware, latência P99 e throughput de requisições.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
          {(['24h', '7d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                range === r ? 'bg-purple-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {r === '24h' ? 'Últimas 24h' : 'Últimos 7 dias'}
            </button>
          ))}
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Uso Média de CPU" value={loading ? '...' : metrics ? `${metrics.cpuUsagePct}%` : '0%'} badge={metrics ? (metrics.cpuUsagePct < 70 ? 'Normal' : 'Alto') : '—'} badgeType={metrics && metrics.cpuUsagePct >= 70 ? 'negative' : 'neutral'} icon={Cpu} />
        <MetricCard title="Uso de RAM" value={loading ? '...' : metrics ? `${metrics.memoryUsagePct}%` : '0%'} badge={metrics ? `${metrics.memoryUsagePct}% Usado` : '—'} badgeType="neutral" icon={HardDrive} />
        <MetricCard title="Latência Média" value={loading ? '...' : metrics ? `${metrics.avgLatencyMs}ms` : '0ms'} badge={metrics && metrics.avgLatencyMs < 200 ? 'SLA Atendido' : 'Atenção'} badgeType={metrics && metrics.avgLatencyMs < 200 ? 'positive' : 'negative'} icon={Clock} />
        <MetricCard title="Taxa de Erro (5xx)" value={loading ? '...' : metrics ? `${metrics.errorRatePct}%` : '0%'} badge={metrics && metrics.errorRatePct < 1 ? 'Sistemas Estáveis' : 'Atenção'} badgeType={metrics && metrics.errorRatePct < 1 ? 'positive' : 'negative'} icon={ShieldAlert} />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CPU & Memory Chart */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 shadow-xl">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              Consumo de Processador (CPU %)
            </h3>
          </div>
          <div className="h-60 w-full">
            {data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#64748B" fontSize={11} />
                  <YAxis stroke="#64748B" fontSize={11} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} />
                  <Area type="monotone" dataKey="cpuUsage" stroke="#8B5CF6" strokeWidth={2} fillOpacity={1} fill="url(#cpuGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-slate-500">No data available</p>
              </div>
            )}
          </div>
        </div>

        {/* Memory Usage Chart */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 shadow-xl">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-cyan-400" />
              Uso de Memória RAM (%)
            </h3>
          </div>
          <div className="h-60 w-full">
            {data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#64748B" fontSize={11} />
                  <YAxis stroke="#64748B" fontSize={11} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} />
                  <Area type="monotone" dataKey="memoryUsage" stroke="#06B6D4" strokeWidth={2} fillOpacity={1} fill="url(#memGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-slate-500">No data available</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};