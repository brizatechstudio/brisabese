import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/common/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  Terminal,
  Search,
  Filter,
  Play,
  Pause,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
  Info,
  Layers,
  Clock
} from 'lucide-react';
import { mockApi } from '../services/mockApi';
import { LogItem } from '../types';
import { useApp } from '../context/AppContext';
import { isRealMode } from '../services/runtime';

export const Logs: React.FC = () => {
  const { showToast } = useApp();
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedService, setSelectedService] = useState<string>('all');

  const loadLogs = async () => {
    setLoading(true);
    const data = await mockApi.getLogs();
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // Em modo real, a transmissão apenas reconsulta os logs persistidos do runtime.
  // A geração sintética fica restrita ao modo mock.
  useEffect(() => {
    if (!isLive) return;
    if (isRealMode) {
      const interval = window.setInterval(() => { void loadLogs(); }, 4000);
      return () => window.clearInterval(interval);
    }

    const interval = window.setInterval(() => {
      const services = ['Database', 'Auth', 'Functions', 'Storage', 'Realtime', 'ApiGateway'];
      const levels: ('info' | 'warn' | 'error')[] = ['info', 'info', 'info', 'warn', 'error'];
      const randomService = services[Math.floor(Math.random() * services.length)];
      const randomLevel = levels[Math.floor(Math.random() * levels.length)];
      const messages: Record<string, string[]> = {
        Database: ['Query index scan on products completed', 'Inserted 1 document in collection orders'],
        Auth: ['Token JWT verified for usr_8892', 'New session token generated'],
        Functions: ['Edge isolate instantiated in 8ms', 'Function processPayment completed in 34ms'],
        Storage: ['CDN cache hit for /uploads/banner.png', 'File uploaded to /avatars/user.jpg'],
        Realtime: ['Ping received from ws_client_889', 'Broadcast sent to channel:orders:live'],
        ApiGateway: ['HTTP GET /v1/products 200 OK', 'Rate limit quota remaining: 9802']
      };
      const randomMsg = messages[randomService][Math.floor(Math.random() * messages[randomService].length)];
      const newLog: LogItem = {
        id: `log-${Date.now()}`,
        level: randomLevel,
        service: randomService,
        message: randomMsg,
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        timeAgo: 'Agora',
        latency: `${Math.floor(Math.random() * 40 + 10)}ms`,
        ip: '189.120.45.12'
      };
      setLogs((prev) => [newLog, ...prev.slice(0, 49)]);
    }, 4000);

    return () => window.clearInterval(interval);
  }, [isLive]);

  const filteredLogs = logs.filter((log) => {
    const matchesLevel = selectedLevel === 'all' || log.level === selectedLevel;
    const matchesService = selectedService === 'all' || log.service === selectedService;
    const matchesSearch =
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.service.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.ip && log.ip.includes(searchQuery));
    return matchesLevel && matchesService && matchesSearch;
  });

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brisabase_logs_${Date.now()}.json`;
    a.click();
    showToast('Logs exportados', 'Arquivo JSON com registros do cluster baixado', 'success');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <PageHeader
        title="Logs & Telemetria em Tempo Real"
        subtitle="Monitore saídas do cluster, chamadas de API, logs de funções e auditoria de segurança ao vivo."
        badge={
          <Badge variant={isLive ? 'success' : 'neutral'} dot={isLive}>
            {isLive ? 'Transmissão Ao Vivo Ativa' : 'Transmissão Pausada'}
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={isLive ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => setIsLive(!isLive)}
              leftIcon={isLive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            >
              {isLive ? 'Pausar Stream' : 'Continuar Ao Vivo'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              leftIcon={<Download className="w-4 h-4" />}
            >
              Exportar
            </Button>
          </div>
        }
      />

      {/* Logs Container */}
      <div className="p-5 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-4">
        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Filtrar por mensagem, IP, serviço..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#0B1628] border border-white/10 text-slate-100 text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Level Filter */}
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#0B1628] border border-white/10 text-slate-300 text-xs focus:outline-none focus:border-cyan-400"
            >
              <option value="all">Todos os Níveis</option>
              <option value="info">INFO</option>
              <option value="warn">WARN</option>
              <option value="error">ERROR</option>
            </select>

            {/* Service Filter */}
            <select
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#0B1628] border border-white/10 text-slate-300 text-xs focus:outline-none focus:border-cyan-400"
            >
              <option value="all">Todos os Serviços</option>
              <option value="Database">Database</option>
              <option value="Auth">Auth</option>
              <option value="Functions">Functions</option>
              <option value="Storage">Storage</option>
              <option value="Realtime">Realtime</option>
              <option value="ApiGateway">ApiGateway</option>
            </select>

            <button
              onClick={() => setLogs([])}
              title="Limpar console"
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-white/[0.06]"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Logs Stream List */}
        <div className="p-3 rounded-xl bg-[#020617] border border-white/[0.06] font-mono text-xs max-h-[580px] overflow-y-auto space-y-1.5 divide-y divide-white/[0.03]">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 italic">
              Nenhum log encontrado para os critérios selecionados.
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="pt-2 pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-white/[0.02] px-2 rounded transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-slate-500 text-[11px] shrink-0 font-sans">{log.timestamp}</span>

                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold shrink-0 ${
                      log.level === 'info'
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : log.level === 'warn'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {log.level}
                  </span>

                  <span className="text-purple-300 text-[11px] font-semibold shrink-0">
                    [{log.service}]
                  </span>

                  <span className="text-slate-200 truncate">{log.message}</span>
                </div>

                <div className="flex items-center gap-3 text-slate-500 text-[11px] shrink-0 font-sans">
                  {log.latency && <span className="text-emerald-400 font-mono">{log.latency}</span>}
                  {log.ip && <span className="text-slate-600 hidden md:inline">{log.ip}</span>}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span>{filteredLogs.length} eventos no buffer</span>
          <span>BrisaBase Log Aggregator • Edge Anycast</span>
        </div>
      </div>
    </div>
  );
};
