import React, { useState, useEffect } from 'react';
import { logsService } from '../services';
import { SystemLog } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';
import { Activity, Search, Filter, RefreshCw, Terminal, X } from 'lucide-react';

export const LogsPage: React.FC = () => {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedService, setSelectedService] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);

  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setError(null);
    try {
      const list = await logsService.listLogs();
      setLogs(list);
    } catch (err: any) {
      setError(err.message || 'Não foi possível carregar os logs.');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredLogs = logs.filter((log) => {
    const matchesService = selectedService === 'all' || log.service.toLowerCase() === selectedService.toLowerCase();
    const matchesSearch =
      !searchTerm ||
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.path || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.ip.includes(searchTerm);
    return matchesService && matchesSearch;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-400" />
            Central de Logs e Auditoria de Sistema
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Logs unificados de chamadas HTTP, exceções de banco, eventos de auth, Storage e Realtime.
          </p>
        </div>

        <button
          onClick={loadData}
          className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-all border border-slate-700"
        >
          <RefreshCw className="w-4 h-4 text-purple-400" />
          Atualizar Stream
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-800 bg-red-950/50 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por mensagem, rota, IP..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-purple-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto text-xs font-medium">
          {['all', 'API', 'Auth', 'Database', 'Storage', 'Realtime'].map((srv) => (
            <button
              key={srv}
              onClick={() => setSelectedService(srv)}
              className={`px-3 py-1.5 rounded-lg transition-colors shrink-0 capitalize ${
                selectedService === srv
                  ? 'bg-purple-600 text-white font-semibold shadow'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {srv === 'all' ? 'Todos Serviços' : srv}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="w-full border-collapse text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400">
              <th className="px-4 py-3 font-semibold">Timestamp</th>
              <th className="px-4 py-3 font-semibold">Serviço</th>
              <th className="px-4 py-3 font-semibold">Método</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Duração</th>
              <th className="px-4 py-3 font-semibold">Rota / Mensagem</th>
              <th className="px-4 py-3 text-right font-semibold">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredLogs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-2.5 whitespace-nowrap text-slate-500 text-[11px]">{log.timestamp}</td>
                <td className="px-4 py-2.5 whitespace-nowrap font-sans">
                  <span className="text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/30 text-[10px] font-semibold">
                    {log.service}
                  </span>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-slate-300 font-bold">{log.method}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <StatusBadge status={log.statusCode} />
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-slate-400">{log.durationMs}ms</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-slate-200 truncate max-w-[280px]">
                  {log.message}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap font-sans">
                  <button
                    onClick={() => setSelectedLog(log)}
                    className="p-1 text-slate-400 hover:text-purple-300 hover:bg-slate-800 rounded"
                  >
                    <Terminal className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-semibold text-slate-100">Payload Detalhado do Log</h3>
              </div>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-950 space-y-1">
                <p><strong className="text-purple-400">ID:</strong> {selectedLog.id}</p>
                <p><strong className="text-purple-400">Timestamp:</strong> {selectedLog.timestamp}</p>
                <p><strong className="text-purple-400">IP Cliente:</strong> {selectedLog.ip}</p>
                <p><strong className="text-purple-400">User Agent:</strong> {selectedLog.userAgent}</p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950 overflow-x-auto text-slate-300">
                <pre>{JSON.stringify(selectedLog, null, 2)}</pre>
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setSelectedLog(null)}
                className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                Fechar Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
