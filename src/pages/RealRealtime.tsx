import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Database, Radio, RefreshCw, Send, Users, Wifi, Zap } from 'lucide-react';
import type { RealtimeChannel } from '../brisabase/types';
import type { RealtimeConnectionInfo, RealtimeEventMock, RealtimeMetrics, RealtimeStatus } from '../brisabase/services/realtimeService';
import { realRealtimeService } from '../services/runtime';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

export const RealRealtime: React.FC = () => {
  const { activeProject, showToast } = useApp();
  const [channels, setChannels] = useState<RealtimeChannel[]>([]);
  const [events, setEvents] = useState<RealtimeEventMock[]>([]);
  const [connections, setConnections] = useState<RealtimeConnectionInfo[]>([]);
  const [metrics, setMetrics] = useState<RealtimeMetrics | null>(null);
  const [status, setStatus] = useState<RealtimeStatus | null>(null);
  const [channel, setChannel] = useState('orders');
  const [eventName, setEventName] = useState('order_created');
  const [payload, setPayload] = useState('{\n  "id": "ord_1001",\n  "status": "paid"\n}');
  const [sending, setSending] = useState(false);

  const load = async () => {
    try {
      const [channelList, eventList, connectionList, currentMetrics, currentStatus] = await Promise.all([
        realRealtimeService.listChannels(),
        realRealtimeService.getRealtimeEvents(),
        realRealtimeService.getConnections(),
        realRealtimeService.getMetrics(),
        realRealtimeService.getStatus()
      ]);
      setChannels(channelList); setEvents(eventList); setConnections(connectionList); setMetrics(currentMetrics); setStatus(currentStatus);
      if (!channel && channelList[0]) setChannel(channelList[0].name);
    } catch (error) { showToast('Realtime indisponível', error instanceof Error ? error.message : 'Falha no runtime WebSocket.', 'error'); }
  };

  useEffect(() => { if (activeProject?.id) void load(); }, [activeProject?.id]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setSending(true);
    try {
      const body = JSON.parse(payload);
      const emitted = await realRealtimeService.sendBroadcastEvent(channel, eventName, body);
      setEvents((prev) => [emitted, ...prev]);
      await load();
      showToast('Evento emitido', `Broadcast/CDC enviado pelo runtime real para ${channel}.`, 'success');
    } catch (error) { showToast('Falha no evento', error instanceof Error ? error.message : 'JSON inválido.', 'error'); }
    finally { setSending(false); }
  };

  const emitDatabaseTest = async () => {
    try {
      await realRealtimeService.emitTestEvent('orders', 'INSERT', { id: `ord_${Date.now()}`, status: 'paid' });
      await load();
      showToast('CDC de teste emitido', 'Evento passou pelo engine Realtime real.', 'success');
    } catch (error) { showToast('Falha no CDC', error instanceof Error ? error.message : undefined, 'error'); }
  };

  const health = useMemo(() => status?.status === 'ok' && status.websocket && status.redis, [status]);

  return <div className="space-y-6 animate-in fade-in duration-300">
    <PageHeader title="Realtime & WebSockets" subtitle="WebSocket, canais, broadcast, presença e PostgreSQL CDC do runtime local real." badge={<Badge variant={health?'success':'warning'} dot>{health?'Realtime REAL • online':'Realtime REAL • verificando'}</Badge>} actions={<Button variant="outline" size="sm" onClick={()=>void load()} leftIcon={<RefreshCw className="w-4 h-4"/>}>Atualizar</Button>}/>

    <div className="grid sm:grid-cols-4 gap-4">
      <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08]"><div className="flex items-center justify-between"><span className="text-xs text-slate-400">Conexões</span><Wifi className="w-4 h-4 text-emerald-400"/></div><div className="mt-1 text-xl font-bold">{metrics?.activeConnections ?? connections.length}</div></div>
      <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08]"><div className="flex items-center justify-between"><span className="text-xs text-slate-400">Canais</span><Radio className="w-4 h-4 text-cyan-400"/></div><div className="mt-1 text-xl font-bold">{metrics?.activeChannels ?? channels.length}</div></div>
      <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08]"><div className="flex items-center justify-between"><span className="text-xs text-slate-400">Eventos/s</span><Activity className="w-4 h-4 text-purple-400"/></div><div className="mt-1 text-xl font-bold text-purple-300">{metrics?.eventsPerSecond ?? 0}</div></div>
      <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08]"><div className="flex items-center justify-between"><span className="text-xs text-slate-400">Latência média</span><Zap className="w-4 h-4 text-amber-400"/></div><div className="mt-1 text-xl font-bold text-cyan-300">{metrics?.averageLatencyMs ?? 0} ms</div></div>
    </div>

    <div className="grid xl:grid-cols-2 gap-5">
      <form onSubmit={send} className="rounded-2xl bg-[#07111F] border border-white/[0.08] p-5 space-y-4"><div className="flex items-center gap-2"><Send className="w-4 h-4 text-cyan-400"/><h3 className="text-sm font-bold">Emitir evento real</h3></div><div className="grid sm:grid-cols-2 gap-3"><label className="text-xs text-slate-400">Canal<input value={channel} onChange={e=>setChannel(e.target.value)} className="mt-1 w-full rounded-xl bg-[#020617] border border-white/10 px-3 py-2 text-slate-100"/></label><label className="text-xs text-slate-400">Evento<input value={eventName} onChange={e=>setEventName(e.target.value)} className="mt-1 w-full rounded-xl bg-[#020617] border border-white/10 px-3 py-2 text-slate-100"/></label></div><label className="block text-xs text-slate-400">Payload JSON<textarea value={payload} onChange={e=>setPayload(e.target.value)} className="mt-1 w-full h-44 rounded-xl bg-[#020617] border border-white/10 p-3 font-mono text-xs text-cyan-300" spellCheck={false}/></label><Button type="submit" variant="gradient" size="sm" isLoading={sending} leftIcon={<Send className="w-3.5 h-3.5"/>}>Transmitir</Button></form>
      <div className="rounded-2xl bg-[#07111F] border border-white/[0.08] p-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Database className="w-4 h-4 text-cyan-400"/><h3 className="text-sm font-bold">PostgreSQL CDC</h3></div><Button variant="outline" size="sm" onClick={()=>void emitDatabaseTest()}>Emitir INSERT de teste</Button></div><div className="mt-4 grid grid-cols-3 gap-2 text-xs"><div className="rounded-xl bg-white/[0.03] p-3"><div className="text-slate-500">WebSocket</div><div className={status?.websocket?'text-emerald-400':'text-rose-400'}>{status?.websocket?'online':'offline'}</div></div><div className="rounded-xl bg-white/[0.03] p-3"><div className="text-slate-500">CDC</div><div className={status?.cdc?'text-emerald-400':'text-rose-400'}>{status?.cdc?'online':'offline'}</div></div><div className="rounded-xl bg-white/[0.03] p-3"><div className="text-slate-500">Redis</div><div className={status?.redis?'text-emerald-400':'text-rose-400'}>{status?.redis?'online':'offline'}</div></div></div><div className="mt-4 text-[11px] text-slate-500">Modo CDC: <span className="font-mono text-slate-300">{status?.cdcDetails?.mode || '—'}</span></div></div>
    </div>

    <div className="grid xl:grid-cols-[1fr_1.3fr] gap-5"><div className="rounded-2xl bg-[#07111F] border border-white/[0.08] p-4"><div className="flex items-center gap-2 mb-3"><Radio className="w-4 h-4 text-cyan-400"/><h3 className="text-sm font-bold">Canais</h3></div><div className="space-y-2">{channels.length===0?<div className="text-xs text-slate-500">Nenhum canal ativo.</div>:channels.map(item=><div key={item.id} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 flex items-center justify-between"><div><div className="text-xs font-semibold text-slate-200">{item.name}</div><div className="text-[10px] text-slate-500">{item.description}</div></div><Badge variant={item.status==='online'?'success':'warning'} size="sm">{item.activeConnections} conexões</Badge></div>)}</div></div><div className="rounded-2xl bg-[#07111F] border border-white/[0.08] p-4"><div className="flex items-center gap-2 mb-3"><Activity className="w-4 h-4 text-emerald-400"/><h3 className="text-sm font-bold">Eventos persistidos</h3></div><div className="max-h-80 overflow-y-auto space-y-2">{events.length===0?<div className="text-xs text-slate-500">Nenhum evento registrado.</div>:events.map(item=><div key={item.id} className="rounded-xl bg-[#020617] border border-white/[0.06] p-3"><div className="flex justify-between gap-3"><span className="font-mono text-xs text-cyan-300">{item.channel} • {item.event}</span><span className="text-[10px] text-slate-500">{item.timestamp} • {item.latencyMs} ms</span></div><pre className="mt-2 text-[10px] text-slate-400 overflow-x-auto">{item.payload}</pre></div>)}</div></div></div>

    <div className="rounded-2xl bg-[#07111F] border border-white/[0.08] overflow-hidden"><div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2"><Users className="w-4 h-4 text-cyan-400"/><h3 className="text-sm font-bold">Conexões WebSocket reais</h3></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-[#0B1628] text-[10px] uppercase text-slate-500"><tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Canais</th><th className="px-4 py-3">IP</th><th className="px-4 py-3">Último sinal</th></tr></thead><tbody className="divide-y divide-white/[0.05] text-slate-300">{connections.map(conn=><tr key={conn.id}><td className="px-4 py-3 font-mono text-cyan-300">{conn.id}</td><td className="px-4 py-3">{conn.role}</td><td className="px-4 py-3 font-mono">{conn.channels.join(', ')||'—'}</td><td className="px-4 py-3">{conn.ip}</td><td className="px-4 py-3">{new Date(conn.lastSeen).toLocaleString('pt-BR')}</td></tr>)}</tbody></table></div></div>
  </div>;
};
