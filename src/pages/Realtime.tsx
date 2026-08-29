import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  Radio,
  Wifi,
  Send,
  Activity,
  Zap,
  Layers,
  Sparkles,
  Users,
  CheckCircle2,
  Clock,
  Database,
  ShieldCheck,
  UserPlus,
  UserMinus
} from 'lucide-react';
import { mockApi } from '../services/mockApi';
import { RealtimeConnection } from '../types';
import { isRealMode } from '../services/runtime';
import { RealRealtime } from './RealRealtime';

interface RealtimeEvent {
  id: string;
  channel: string;
  event: string;
  payload: any;
  timestamp: string;
}

const MockRealtime: React.FC = () => {
  const { showToast } = useApp();
  const [connections, setConnections] = useState<RealtimeConnection[]>([]);
  const [activeChannel, setActiveChannel] = useState<string>('channel:orders:live');
  const [eventName, setEventName] = useState<string>('order_created');
  const [eventPayload, setEventPayload] = useState<string>('{\n  "orderId": "ord_9921",\n  "total": 450.00,\n  "status": "paid"\n}');
  const [events, setEvents] = useState<RealtimeEvent[]>([
    {
      id: 'ev-1',
      channel: 'channel:orders:live',
      event: 'order_status_updated',
      payload: { orderId: 'ord_8820', status: 'shipped' },
      timestamp: '14:20:12'
    },
    {
      id: 'ev-2',
      channel: 'channel:chat:support',
      event: 'message_delivered',
      payload: { chatId: 'chat_331', text: 'Atendimento iniciado' },
      timestamp: '14:19:45'
    },
    {
      id: 'ev-3',
      channel: 'channel:telemetry:gps',
      event: 'location_ping',
      payload: { lat: -23.5505, lng: -46.6333, speed: 64 },
      timestamp: '14:18:30'
    }
  ]);

  const [presenceUsers, setPresenceUsers] = useState([
    { id: 'presence-1', name: 'Ana Souza', state: 'online', device: 'Chrome • Web', lastSeen: 'agora' },
    { id: 'presence-2', name: 'Lucas Moreira', state: 'editing', device: 'Safari • macOS', lastSeen: 'agora' },
    { id: 'presence-3', name: 'Maria Lima', state: 'idle', device: 'Brisa App • Android', lastSeen: '34s' }
  ]);
  const [dbChangeCount, setDbChangeCount] = useState(0);


  useEffect(() => {
    mockApi.getRealtimeConnections().then(setConnections);
  }, []);

  const handleBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsed = JSON.parse(eventPayload);
      const newEvent: RealtimeEvent = {
        id: `ev-${Date.now()}`,
        channel: activeChannel,
        event: eventName,
        payload: parsed,
        timestamp: new Date().toLocaleTimeString('pt-BR')
      };

      setEvents((prev) => [newEvent, ...prev]);
      showToast('Evento Emitido!', `Broadcast enviado para ${activeChannel}`, 'success');
    } catch (err) {
      showToast('JSON Inválido', 'Corrija o payload do evento', 'error');
    }
  };

  const simulatePresenceJoin = () => {
    const id = `presence-${Date.now()}`;
    setPresenceUsers((prev) => [{ id, name: 'Guest Preview', state: 'online', device: 'SDK Simulator', lastSeen: 'agora' }, ...prev]);
    showToast('Presence JOIN', 'Novo cliente adicionado ao estado de presença simulado.', 'success');
  };

  const simulatePresenceLeave = () => {
    setPresenceUsers((prev) => prev.length > 1 ? prev.slice(0, -1) : prev);
    showToast('Presence LEAVE', 'Cliente removido do estado de presença simulado.', 'info');
  };

  const simulateDatabaseChange = () => {
    const next = dbChangeCount + 1;
    setDbChangeCount(next);
    const newEvent: RealtimeEvent = {
      id: `db-ev-${Date.now()}`,
      channel: 'postgres:public.orders',
      event: 'postgres_changes:INSERT',
      payload: { schema: 'public', table: 'orders', type: 'INSERT', new: { id: `ord_mock_${1000 + next}`, status: 'paid', total: 129.9 + next } },
      timestamp: new Date().toLocaleTimeString('pt-BR')
    };
    setEvents((prev) => [newEvent, ...prev]);
    showToast('Database change emitido', 'INSERT simulado enviado aos subscribers autorizados.', 'success');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <PageHeader
        title="Realtime & WebSockets"
        subtitle="Gerencie canais de broadcast, presença de usuários e sincronização bidirecional de estado."
        badge={
          <Badge variant="success" dot>
            WebSocket Engine • 5 Clientes Conectados
          </Badge>
        }
      />

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08] flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">Conexões Simultâneas</div>
            <div className="text-xl font-bold text-slate-100 mt-1">{connections.length} ativas</div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
            <Radio className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08] flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">Latência de Broadcast</div>
            <div className="text-xl font-bold text-cyan-400 mt-1">&lt; 15ms</div>
          </div>
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
            <Zap className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08] flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">Mensagens / Segundo</div>
            <div className="text-xl font-bold text-purple-400 mt-1">1,280 msg/s</div>
          </div>
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
            <Activity className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Realtime capabilities */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          [Radio, 'Broadcast', 'Eventos low-latency por canais públicos ou privados.', 'Ativo'],
          [Users, 'Presence', 'Estado online, join/leave/sync e metadata por cliente.', 'Ativo'],
          [Database, 'Postgres Changes', 'INSERT/UPDATE/DELETE via publication/CDC simulada.', 'Ativo'],
          [ShieldCheck, 'Channel Authorization', 'Policies/RLS para broadcast, presence e private channels.', 'Enforced']
        ].map(([Icon, title, description, status]: any) => (
          <div key={title} className="rounded-2xl bg-[#07111F] border border-white/[0.08] p-4">
            <div className="flex items-center justify-between gap-3"><span className="w-9 h-9 rounded-xl bg-cyan-500/10 grid place-items-center"><Icon className="w-4 h-4 text-cyan-400" /></span><Badge variant="success" size="sm">{status}</Badge></div>
            <div className="mt-3 text-xs font-bold text-slate-200">{title}</div>
            <div className="mt-1 text-[11px] text-slate-500 leading-relaxed">{description}</div>
          </div>
        ))}
      </div>

      {/* Broadcast Simulator & Live Event Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Broadcast Sender */}
        <div className="p-5 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-white/[0.06]">
            <Radio className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-slate-100">Simulador de Broadcast em Canal</h3>
          </div>

          <form onSubmit={handleBroadcast} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Canal de Escuta</label>
                <select
                  value={activeChannel}
                  onChange={(e) => setActiveChannel(e.target.value)}
                  className="w-full rounded-xl bg-[#0B1628] border border-white/10 text-slate-100 text-xs px-3 py-2 focus:outline-none focus:border-cyan-400"
                >
                  <option value="channel:orders:live">channel:orders:live</option>
                  <option value="channel:chat:support">channel:chat:support</option>
                  <option value="channel:telemetry:gps">channel:telemetry:gps</option>
                  <option value="channel:dashboard:metrics">channel:dashboard:metrics</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nome do Evento</label>
                <input
                  type="text"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  className="w-full rounded-xl bg-[#0B1628] border border-white/10 text-slate-100 text-xs px-3 py-2 focus:outline-none focus:border-cyan-400"
                  placeholder="ex: new_message"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Payload do Evento (JSON)</label>
              <textarea
                value={eventPayload}
                onChange={(e) => setEventPayload(e.target.value)}
                className="w-full h-36 p-3 rounded-xl bg-[#020617] border border-white/10 text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-400 resize-none selection:bg-cyan-500/30"
                spellCheck={false}
              />
            </div>

            <Button
              type="submit"
              variant="gradient"
              size="sm"
              className="w-full"
              leftIcon={<Send className="w-3.5 h-3.5" />}
            >
              Emitir Evento para Conexões
            </Button>
          </form>
        </div>

        {/* Live Received Events Feed */}
        <div className="p-5 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-100">Feed de Eventos Recebidos</h3>
              </div>
              <span className="text-[11px] text-emerald-400 font-mono animate-pulse">● Sincronizado</span>
            </div>

            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className="p-3 rounded-xl bg-[#020617] border border-white/[0.06] font-mono text-xs space-y-1.5 animate-in fade-in"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400 font-bold">{ev.event}</span>
                      <span className="text-[10px] text-slate-500 font-sans">({ev.channel})</span>
                    </div>
                    <span className="text-[10px] text-slate-500">{ev.timestamp}</span>
                  </div>
                  <pre className="text-slate-300 text-[11px] overflow-x-auto">
                    {JSON.stringify(ev.payload, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-400">
            <span>Buffer de eventos em memória</span>
            <button onClick={() => setEvents([])} className="text-cyan-400 hover:underline">
              Limpar Feed
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="p-5 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2"><Users className="w-4 h-4 text-cyan-400" /><h3 className="text-sm font-bold text-slate-100">Presence State</h3><Badge variant="cyan" size="sm">join / leave / sync</Badge></div>
            <div className="flex gap-1.5"><button onClick={simulatePresenceJoin} className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" title="Simular join"><UserPlus className="w-3.5 h-3.5" /></button><button onClick={simulatePresenceLeave} className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20" title="Simular leave"><UserMinus className="w-3.5 h-3.5" /></button></div>
          </div>
          <div className="mt-3 space-y-2">
            {presenceUsers.map((user) => <div key={user.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#020617] border border-white/[0.06] p-3"><div className="flex items-center gap-3"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.5)]" /><div><div className="text-xs font-semibold text-slate-200">{user.name}</div><div className="text-[10px] text-slate-500">{user.device}</div></div></div><div className="text-right"><div className="text-[10px] text-cyan-300">{user.state}</div><div className="text-[10px] text-slate-600">{user.lastSeen}</div></div></div>)}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2"><Database className="w-4 h-4 text-cyan-400" /><h3 className="text-sm font-bold text-slate-100">Database Changes</h3><Badge variant="success" size="sm">publication active</Badge></div>
            <Button variant="outline" size="sm" onClick={simulateDatabaseChange} leftIcon={<Zap className="w-3.5 h-3.5" />}>Simular INSERT</Button>
          </div>
          <div className="mt-3 space-y-2">
            {[
              ['public.orders', 'INSERT, UPDATE', 'status=eq.paid', 'Private'],
              ['public.messages', '*', 'room_id=eq.{topic}', 'Private'],
              ['public.products', 'UPDATE', 'stock=lt.10', 'Public']
            ].map(([table, eventsAllowed, filter, privacy]) => <div key={table} className="rounded-xl bg-[#020617] border border-white/[0.06] p-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-mono font-semibold text-cyan-300">{table}</span><Badge variant={privacy === 'Private' ? 'purple' : 'cyan'} size="sm">{privacy}</Badge></div><div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-slate-500"><span>Events: <b className="text-slate-300">{eventsAllowed}</b></span><span>Filter: <b className="text-slate-300 font-mono">{filter}</b></span></div></div>)}
          </div>
          <div className="mt-3 rounded-xl bg-cyan-500/[0.05] border border-cyan-500/15 p-3 text-[11px] text-slate-400">Private channels e mudanças de banco respeitam policies simuladas antes da entrega aos clientes.</div>
        </div>
      </div>

      {/* Active WebSocket Clients Table */}
      <div className="p-5 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-3">
        <h3 className="text-sm font-bold text-slate-100">Clientes Conectados em Tempo Real</h3>
        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#0B1628] text-slate-400 font-mono text-[11px] uppercase border-b border-white/[0.08]">
              <tr>
                <th className="py-3 px-4">Client ID</th>
                <th className="py-3 px-4">Usuário</th>
                <th className="py-3 px-4">Canal Inscrito</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Ping</th>
                <th className="py-3 px-4">Último Evento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] font-mono">
              {connections.map((c) => (
                <tr key={c.id} className="hover:bg-white/[0.04] transition-colors">
                  <td className="py-3 px-4 text-cyan-300 font-semibold">{c.clientId}</td>
                  <td className="py-3 px-4 font-sans flex items-center gap-2">
                    <img
                      src={c.userAvatar}
                      alt={c.userName}
                      referrerPolicy="no-referrer"
                      className="w-6 h-6 rounded-full object-cover"
                    />
                    <span className="text-slate-200">{c.userName}</span>
                  </td>
                  <td className="py-3 px-4 text-purple-300">{c.channel}</td>
                  <td className="py-3 px-4">
                    <Badge variant="success" size="sm" dot>
                      {c.status}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-emerald-400">{c.ping}ms</td>
                  <td className="py-3 px-4 text-slate-400 text-[11px] font-sans">{c.lastEvent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};


export const Realtime: React.FC = () => isRealMode ? <RealRealtime /> : <MockRealtime />;
