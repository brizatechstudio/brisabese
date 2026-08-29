import React, { useState } from 'react';
import { PageHeader } from '../components/common/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { mockAnalyticsData } from '../data/mockAnalytics';
import { BarChart3, TrendingUp, Zap, Globe, HardDrive, Activity, Download } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const Analytics: React.FC = () => {
  const { showToast } = useApp();
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');

  const handleExport = () => {
    showToast('Relatório Exportado', 'Métricas exportadas em formato CSV com sucesso', 'success');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <PageHeader
        title="Analytics & Telemetria"
        subtitle="Métricas detalhadas de requisições, latência global, IOPS do banco de dados e tráfego de CDN."
        badge={
          <Badge variant="cyan" dot>
            Telemetria em Tempo Real
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-[#0B1628] rounded-xl border border-white/[0.08]">
              {(['24h', '7d', '30d'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase transition-colors ${
                    timeRange === r ? 'bg-[#1677FF] text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              leftIcon={<Download className="w-4 h-4" />}
            >
              Exportar CSV
            </Button>
          </div>
        }
      />

      {/* Primary Traffic Area Chart */}
      <div className="p-6 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100">Requisições HTTP por Hora</h3>
            <p className="text-xs text-slate-400">Total de chamadas bem-sucedidas e tráfego de entrada.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-emerald-400 font-mono font-bold">● Pico: 142k req/h</span>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mockAnalyticsData.requestsPerHour}>
              <defs>
                <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#12D9FF" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#1677FF" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
              <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#07111F',
                  borderColor: 'rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  color: '#f8fafc',
                  fontSize: '12px'
                }}
              />
              <Area
                type="monotone"
                dataKey="requests"
                stroke="#12D9FF"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorReq)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Two-Column Grid: Database IOPS & Regional Latency */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* DB Read vs Write Bar Chart */}
        <div className="p-6 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-100">Operações de Banco de Dados (IOPS)</h3>
            <p className="text-xs text-slate-400">Distribuição entre leituras e gravações por segundo.</p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockAnalyticsData.dbOperations}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                <XAxis dataKey="day" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#07111F',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    color: '#f8fafc',
                    fontSize: '12px'
                  }}
                />
                <Legend />
                <Bar dataKey="reads" name="Leituras" fill="#12D9FF" radius={[6, 6, 0, 0]} />
                <Bar dataKey="writes" name="Gravações" fill="#7C3AED" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Regional Distribution */}
        <div className="p-6 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100">Distribuição Global de Tráfego</h3>
            <p className="text-xs text-slate-400">Latência medida por região de borda conectada.</p>
          </div>

          <div className="space-y-3.5 my-2">
            {mockAnalyticsData.regionalLatency.map((reg) => (
              <div key={reg.region} className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">{reg.region}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400 font-mono font-bold">{reg.latency}</span>
                    <span className="text-slate-400">{reg.share}</span>
                  </div>
                </div>
                <div className="w-full h-2 rounded-full bg-[#0B1628] overflow-hidden border border-white/[0.04]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#1677FF] to-[#12D9FF]"
                    style={{ width: reg.share }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-400">
            <span>Roteamento Anycast BGP ativo</span>
            <span className="text-emerald-400 font-semibold">● 100% Pop Saúde</span>
          </div>
        </div>
      </div>
    </div>
  );
};
