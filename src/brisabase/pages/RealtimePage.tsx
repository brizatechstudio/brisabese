import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { realtimeService } from '../services';
import { RealtimeChannel } from '../types';
import { RealtimeMetrics, RealtimeConnectionInfo, RealtimeStatus, RealtimeEventMock } from '../services/realtimeService';
import { MetricCard } from '../components/common/MetricCard';
import { Radio, Activity, Zap, Send, Wifi, Users, Database, AlertTriangle, CheckCircle2 } from 'lucide-react';

export const RealtimePage: React.FC = () => {
  const { activeOrganizationId, activeProjectId, activeEnvironmentId, addToast } = useApp();
  const [channels, setChannels] = useState<RealtimeChannel[]>([]);
  const [logs, setLogs] = useState<RealtimeEventMock[]>([]);
  const [metrics, setMetrics] = useState<RealtimeMetrics | null>(null);
  const [connections, setConnections] = useState<RealtimeConnectionInfo[]>([]);
  const [status, setStatus] = useState<RealtimeStatus | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [eventName, setEventName] = useState('INSERT');
  const [payloadText, setPayloadText] = useState('{\n  "name": "Exemplo",\n  "value": 1\n}');
  const [activeTab, setActiveTab] = useState<'overview' | 'channels' | 'connections' | 'events'>('overview');
  const [selectedEvent, setSelectedEvent] = useState<RealtimeEventMock | null>(null);

  const orgId = activeOrganizationId;
  const projId = activeProjectId || '';
  const envId = activeEnvironmentId;

  const loadData = async () => {
    try {
      const [cList, lList, mList, connList, sList] = await Promise.all([
        realtimeService.listChannels(orgId, projId, envId),
        realtimeService.getRealtimeEvents(orgId, projId, envId),
        realtimeService.getMetrics(orgId, projId, envId),
        realtimeService.getConnections(orgId, projId, envId),
        realtimeService.getStatus(orgId, projId, envId),
      ]);
      setChannels(cList);
      setLogs(lList);
      setMetrics(mList);
      setConnections(connList);
      setStatus(sList);
      if (!selectedChannel && cList.length > 0) {
        setSelectedChannel(cList[0].name);
      }
    } catch (err) {
      console.error('Erro ao carregar dados realtime:', err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [projId, envId]);

  const handleBroadcast = async () => {
    try {
      const payloadObj = JSON.parse(payloadText);
      await realtimeService.sendBroadcastEvent(selectedChannel, eventName, payloadObj, orgId, projId, envId);
      addToast('Evento transmitido', `Evento ${eventName} enviado para o canal ${selectedChannel}.`, 'success');
      await loadData();
    } catch (e) {
      addToast('Payload JSON inválido', 'Verifique a sintaxe do JSON.', 'error');
    }
  };

  const handleEmitTest = async () => {
    try {
      const payloadObj = JSON.parse(payloadText);
      await realtimeService.emitTestEvent(selectedChannel, eventName, payloadObj, undefined, orgId, projId, envId);
      addToast('Evento CDC emitido', `Evento ${eventName} simulado na tabela ${selectedChannel}.`, 'success');
      await loadData();
    } catch (e) {
      addToast('Payload JSON inválido', 'Verifique a sintaxe do JSON.', 'error');
    }
  };

  const statusColor = status?.status === 'ok' ? 'text-emerald-400' : status?.status === 'degraded' ? 'text-amber-400' : 'text-red-400';
  const statusIcon = status?.status === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : status?.status === 'degraded' ? <AlertTriangle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Radio className="w-5 h-5 text-purple-400" />
            Realtime Engine
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            PostgreSQL CDC + WebSocket + Channels + Broadcast + Presence
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-2 text-xs font-semibold ${statusColor}`}>
            {statusIcon}
            {status?.status === 'ok' ? 'Connected' : status?.status === 'degraded' ? 'Degraded' : 'Disconnected'}
          </span>
          <span className="text-xs text-slate-500">
            WebSocket: {status?.websocket ? '✓' : '✗'} | CDC: {status?.cdc ? '✓' : '✗'} | Redis: {status?.redis ? '✓' : '✗'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { id: 'overview', label: 'Visão Geral' },
          { id: 'channels', label: 'Canais' },
          { id: 'connections', label: 'Conexões' },
          { id: 'events', label: 'Inspetor de Eventos' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-purple-600/20 text-white border border-purple-500/30'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard title="Conexões Ativas" value={metrics ? String(metrics.activeConnections) : '—'} badge="WebSockets" badgeType="positive" icon={Wifi} />
            <MetricCard title="Canais Ativos" value={metrics ? String(metrics.activeChannels) : '—'} badge="Pub/Sub" badgeType="neutral" icon={Radio} />
            <MetricCard title="Eventos / Seg" value={metrics ? String(metrics.eventsPerSecond) : '—'} badge="CDC" badgeType="neutral" icon={Zap} />
            <MetricCard title="Latência Média" value={metrics ? `${metrics.averageLatencyMs}ms` : '—'} badge="Excelente" badgeType="positive" icon={Activity} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard title="Mensagens / Seg" value={metrics ? String(metrics.messagesPerSecond) : '—'} badge="Throughput" badgeType="neutral" icon={Send} />
            <MetricCard title="Broadcasts / Seg" value={metrics ? String(metrics.broadcastsPerSecond) : '—'} badge="Broadcast" badgeType="neutral" icon={Radio} />
            <MetricCard title="Inscrições" value={metrics ? String(metrics.subscriptionsCount) : '—'} badge="Subscriptions" badgeType="neutral" icon={Users} />
            <MetricCard title="Erros" value={metrics ? String(metrics.errorsCount) : '—'} badge={metrics && metrics.errorsCount > 0 ? 'Atenção' : 'OK'} badgeType={metrics && metrics.errorsCount > 0 ? 'negative' : 'positive'} icon={AlertTriangle} />
          </div>

          {/* Broadcast Tester */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 shadow-xl">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Send className="w-4 h-4 text-purple-400" />
                  Disparar Evento
                </h2>
                <p className="text-xs text-slate-400">Simule eventos CDC ou broadcasts para clientes conectados</p>
              </div>

              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Canal / Tabela</label>
                  <select
                    value={selectedChannel}
                    onChange={(e) => setSelectedChannel(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-slate-100 focus:border-purple-500 focus:outline-none"
                  >
                    {channels.length > 0 ? channels.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name} ({c.activeConnections} inscritos)
                      </option>
                    )) : (
                      <option value="" disabled>
                        Nenhum canal disponível
                      </option>
                    )}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Evento</label>
                  <select
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-slate-100 focus:border-purple-500 focus:outline-none"
                  >
                    <option value="INSERT">INSERT</option>
                    <option value="UPDATE">UPDATE</option>
                    <option value="DELETE">DELETE</option>
                    <option value="broadcast">broadcast</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Payload JSON</label>
                  <textarea
                    rows={4}
                    value={payloadText}
                    onChange={(e) => setPayloadText(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-slate-200 focus:border-purple-500 focus:outline-none resize-none leading-relaxed"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleBroadcast}
                    disabled={!selectedChannel}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 font-semibold text-white hover:bg-purple-500 shadow-md shadow-purple-900/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                    Transmitir
                  </button>
                  <button
                    onClick={handleEmitTest}
                    disabled={!selectedChannel}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-700 py-2.5 font-semibold text-white hover:bg-slate-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Database className="w-4 h-4" />
                    Emitir CDC
                  </button>
                </div>
              </div>
            </div>

            {/* Live Event Stream Feed */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 shadow-xl">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    Stream de Eventos em Tempo Real
                  </h2>
                  <p className="text-xs text-slate-400">Eventos CDC e broadcasts recentes</p>
                </div>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    onClick={() => setSelectedEvent(log)}
                    className="p-3 rounded-xl border border-slate-800 bg-slate-950 font-mono text-xs space-y-1 hover:border-purple-500/30 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-purple-400 font-bold">{log.channel}</span>
                      <span className="text-slate-500">{log.timestamp}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-emerald-300 font-semibold">{log.event}</span>
                      <span className="text-[10px] text-slate-500">
                        {log.latencyMs}ms latência
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'channels' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 shadow-xl">
          <h2 className="text-sm font-bold text-slate-100">Canais Ativos</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="text-left py-2 px-3">Canal</th>
                  <th className="text-left py-2 px-3">Conexões</th>
                  <th className="text-left py-2 px-3">Eventos</th>
                  <th className="text-left py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2 px-3 font-mono text-purple-300">{c.name}</td>
                    <td className="py-2 px-3 text-slate-300">{c.activeConnections}</td>
                    <td className="py-2 px-3 text-slate-300">{c.eventsPerMin}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        c.status === 'online' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'connections' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 shadow-xl">
          <h2 className="text-sm font-bold text-slate-100">Conexões Ativas</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="text-left py-2 px-3">Connection ID</th>
                  <th className="text-left py-2 px-3">Usuário</th>
                  <th className="text-left py-2 px-3">Role</th>
                  <th className="text-left py-2 px-3">Canais</th>
                  <th className="text-left py-2 px-3">Conectado Em</th>
                  <th className="text-left py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => (
                  <tr key={c.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2 px-3 font-mono text-purple-300">{c.id}</td>
                    <td className="py-2 px-3 text-slate-300">{c.userId || 'anonymous'}</td>
                    <td className="py-2 px-3 text-slate-300">{c.role}</td>
                    <td className="py-2 px-3 text-slate-300">{c.channels.join(', ') || '—'}</td>
                    <td className="py-2 px-3 text-slate-400">{new Date(c.connectedAt).toLocaleTimeString('pt-BR', { hour12: false })}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        c.isAlive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                      }`}>
                        {c.isAlive ? 'online' : 'offline'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'events' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 shadow-xl">
            <h2 className="text-sm font-bold text-slate-100">Inspetor de Eventos</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  onClick={() => setSelectedEvent(log)}
                  className={`p-3 rounded-xl border font-mono text-xs space-y-1 transition-colors cursor-pointer ${
                    selectedEvent?.id === log.id
                      ? 'border-purple-500/50 bg-purple-500/10'
                      : 'border-slate-800 bg-slate-950 hover:border-purple-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-purple-400 font-bold">{log.channel}</span>
                    <span className="text-slate-500">{log.timestamp}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-300 font-semibold">{log.event}</span>
                    <span className="text-[10px] text-slate-500">{log.latencyMs}ms</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 shadow-xl">
            <h2 className="text-sm font-bold text-slate-100">Detalhes do Evento</h2>
            {selectedEvent ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-slate-500 block">Evento</span>
                    <span className="text-emerald-300 font-semibold">{selectedEvent.event}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-slate-500 block">Canal</span>
                    <span className="text-purple-300 font-semibold">{selectedEvent.channel}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-slate-500 block">Timestamp</span>
                    <span className="text-slate-300">{selectedEvent.timestamp}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-slate-500 block">Latência</span>
                    <span className="text-slate-300">{selectedEvent.latencyMs}ms</span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-xs mb-2">Payload</span>
                  <pre className="text-[11px] text-slate-300 whitespace-pre-wrap font-mono">
                    {selectedEvent.payload}
                  </pre>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Selecione um evento para ver os detalhes.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
