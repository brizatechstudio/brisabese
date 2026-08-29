import React, { useState, useEffect } from 'react';
import { functionsService } from '../services';
import { ServerlessFunction } from '../types';
import { FunctionEditorModal } from '../components/functions/FunctionEditorModal';
import { MetricCard } from '../components/common/MetricCard';
import { StatusBadge } from '../components/common/StatusBadge';
import {
  Code2,
  Zap,
  Play,
  Terminal,
  Clock,
  Plus,
  Trash2,
  ShieldCheck
} from 'lucide-react';

export const FunctionsPage: React.FC = () => {
  const [functions, setFunctions] = useState<ServerlessFunction[]>([]);
  const [selectedFunction, setSelectedFunction] = useState<ServerlessFunction | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'code' | 'logs' | 'env'>('overview');
  const [logs, setLogs] = useState<Array<{ id: string; level: string; message: string; createdAt: string }>>([]);
  const [metrics, setMetrics] = useState({ invocations: 0, errors: 0, timeouts: 0, avgDurationMs: 0, successRate: 100 });
  const [error, setError] = useState<string | null>(null);
  const [environmentText, setEnvironmentText] = useState('{}');
  const [environmentSaving, setEnvironmentSaving] = useState(false);

  const selectFunction = async (fn: ServerlessFunction) => {
    setError(null);
    try {
      const [detail, functionLogs, functionMetrics, environment] = await Promise.all([
        functionsService.getFunction(fn.id),
        functionsService.getLogs(fn.id),
        functionsService.getMetrics(fn.id),
        functionsService.listEnvironment()
      ]);
      setSelectedFunction(detail || fn);
      setLogs(functionLogs);
      setMetrics(functionMetrics);
      setEnvironmentText(JSON.stringify(environment, null, 2));
    } catch (err: any) {
      setError(err.message || 'Não foi possível carregar os dados da function.');
    }
  };

  const loadData = async () => {
    setError(null);
    try {
      const list = await functionsService.listFunctions();
      setFunctions(list);
      if (list.length > 0 && !selectedFunction) await selectFunction(list[0]);
    } catch (err: any) {
      setError(err.message || 'Não foi possível carregar os dados.');
    }
  };

  useEffect(() => { void loadData(); }, []);

  const handleCreateFunction = async (data: any) => {
    await functionsService.createFunction(data);
    await loadData();
  };

  const handleTriggerFunction = async (fnId: string) => {
    try {
      await functionsService.invokeFunction(fnId, {});
      alert('Function executada com sucesso.');
      await loadData();
      const current = await functionsService.getFunction(fnId);
      if (current) await selectFunction(current);
    } catch (err: any) {
      setError(err.message || 'A Function não pôde ser executada. Verifique se o executor isolado está habilitado neste ambiente.');
    }
  };

  const handleDeleteFunction = async (fnId: string) => {
    await functionsService.deleteFunction(fnId);
    setSelectedFunction(null);
    await loadData();
  };

  const handleSaveEnvironment = async () => {
    if (!selectedFunction) return;
    setEnvironmentSaving(true);
    setError(null);
    try {
      const parsed = JSON.parse(environmentText || '{}');
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || Object.values(parsed).some((value) => typeof value !== 'string')) {
        throw new Error('Use um objeto JSON com valores string. Ex.: {"API_URL":"https://..."}.');
      }
      await functionsService.updateEnvVars(selectedFunction.id, parsed as Record<string, string>);
      setEnvironmentText(JSON.stringify(await functionsService.listEnvironment(), null, 2));
    } catch (err: any) {
      setError(err.message || 'Não foi possível salvar as variáveis do ambiente.');
    } finally {
      setEnvironmentSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Code2 className="w-5 h-5 text-purple-400" />
            Serverless Functions (Node.js / TypeScript)
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Deploy versionado com executor separado, limites de memória/tempo, secrets, logs, rollback, filas e cron.
          </p>
        </div>

        <button onClick={() => setIsCreateModalOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-purple-500 shadow-lg shadow-purple-900/40 transition-all">
          <Plus className="w-4 h-4" />
          Nova Function
        </button>
      </div>

      <div className="rounded-xl border border-cyan-900/60 bg-cyan-950/25 p-4 text-xs text-cyan-200 flex items-start gap-3">
        <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
        <div><strong>Execution plane isolado.</strong><p className="mt-1 text-cyan-200/80">Em produção, o processo principal não executa código do cliente. A invocação é delegada a um serviço executor separado e sem credenciais de PostgreSQL, Redis ou Storage; acessos permitidos retornam por capacidades RPC temporárias.</p></div>
      </div>

      {error && <div className="rounded-xl border border-red-800 bg-red-950/50 p-4 text-sm text-red-300">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Functions" value={`${functions.length} Functions`} badge="Executor isolado" badgeType="positive" icon={Code2} />
        <MetricCard title="Invocações" value={metrics.invocations.toLocaleString()} badge={`${metrics.timeouts} timeouts`} badgeType="neutral" icon={Zap} />
        <MetricCard title="Tempo Médio" value={`${metrics.avgDurationMs}ms`} badge="Execution Plane" badgeType="positive" icon={Clock} />
        <MetricCard title="Taxa de Erros" value={`${metrics.invocations ? ((metrics.errors / metrics.invocations) * 100).toFixed(2) : '0.00'}%`} badge={`${metrics.successRate}% sucesso`} badgeType="positive" icon={Terminal} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-2 bg-slate-900/60 p-3 rounded-2xl border border-slate-800 h-fit">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 block">Suas Functions ({functions.length})</span>
          <div className="space-y-1">
            {functions.length === 0 && <div className="px-3 py-8 text-center text-xs text-slate-500">Nenhuma Function criada.</div>}
            {functions.map((fn) => {
              const isSelected = selectedFunction?.id === fn.id;
              return (
                <button key={fn.id} onClick={() => void selectFunction(fn)} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all ${isSelected ? 'bg-purple-600/20 text-white border border-purple-500/30 font-bold' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                  <div className="truncate text-left"><p className="truncate text-slate-200 font-mono">{fn.name}</p><p className="text-[10px] text-slate-500 font-sans mt-0.5">{fn.runtime}</p></div>
                  <StatusBadge status={fn.status} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          {selectedFunction ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-3"><h2 className="text-lg font-bold font-mono text-slate-100">{selectedFunction.name}</h2><StatusBadge status={selectedFunction.status} /></div>
                  <p className="text-xs text-slate-400 mt-1 font-mono">{selectedFunction.endpointUrl}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => void handleTriggerFunction(selectedFunction.id)} className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 shadow-md shadow-purple-900/30"><Play className="w-3.5 h-3.5 fill-current" />Testar Invocação</button>
                  <button onClick={() => void handleDeleteFunction(selectedFunction.id)} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-xl" title="Excluir Function"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="flex items-center gap-2 border-b border-slate-800 text-xs font-medium overflow-x-auto">
                {[{ id: 'overview', label: 'Visão Geral & Métricas' },{ id: 'code', label: 'Código Fonte' },{ id: 'logs', label: 'Logs de Execução' },{ id: 'env', label: 'Variáveis' }].map((tab) => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-3 py-1.5 rounded-t-lg whitespace-nowrap transition-colors ${activeTab === tab.id ? 'bg-purple-600/30 text-white font-bold border-t border-x border-purple-500/30' : 'text-slate-400 hover:text-slate-200'}`}>{tab.label}</button>
                ))}
              </div>

              {activeTab === 'overview' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                  <div className="p-3 rounded-xl border border-slate-800 bg-slate-950 space-y-1"><span className="text-[10px] text-slate-500 uppercase">Invocações</span><p className="text-base font-bold text-slate-100">{metrics.invocations.toLocaleString()}</p></div>
                  <div className="p-3 rounded-xl border border-slate-800 bg-slate-950 space-y-1"><span className="text-[10px] text-slate-500 uppercase">Tempo Médio</span><p className="text-base font-bold text-emerald-400">{metrics.avgDurationMs} ms</p></div>
                  <div className="p-3 rounded-xl border border-slate-800 bg-slate-950 space-y-1"><span className="text-[10px] text-slate-500 uppercase">Memória</span><p className="text-base font-bold text-purple-400">{(selectedFunction as any).memoryMb ?? 128} MB</p></div>
                  <div className="p-3 rounded-xl border border-slate-800 bg-slate-950 space-y-1"><span className="text-[10px] text-slate-500 uppercase">Runtime</span><p className="text-base font-bold text-cyan-400">{selectedFunction.runtime}</p></div>
                </div>
              )}

              {activeTab === 'code' && <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-200 overflow-x-auto"><pre className="leading-relaxed">{selectedFunction.codeSnippet}</pre></div>}

              {activeTab === 'logs' && (
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-300 space-y-2">
                  {logs.length === 0 ? <p className="text-slate-500">Nenhum log de execução ainda.</p> : logs.map((log) => (
                    <p key={log.id} className={log.level === 'error' ? 'text-rose-400' : log.level === 'warn' ? 'text-amber-400' : 'text-emerald-400'}>[{new Date(log.createdAt).toLocaleString()}] {log.message}</p>
                  ))}
                </div>
              )}


              {activeTab === 'env' && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-3 text-xs text-amber-200">
                    Estas variáveis pertencem ao ambiente atual do projeto e ficam disponíveis para Functions via execution plane. Secrets sensíveis devem usar o cofre de Secrets, não este JSON.
                  </div>
                  <textarea value={environmentText} onChange={(event) => setEnvironmentText(event.target.value)} spellCheck={false} className="min-h-64 w-full rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-200 outline-none focus:border-purple-500" />
                  <div className="flex justify-end"><button disabled={environmentSaving} onClick={() => void handleSaveEnvironment()} className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-50">{environmentSaving ? 'Salvando…' : 'Salvar variáveis'}</button></div>
                </div>
              )}
            </div>
          ) : <div className="p-12 text-center text-slate-500">Nenhuma Function selecionada.</div>}
        </div>
      </div>

      <FunctionEditorModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onCreate={handleCreateFunction} />
    </div>
  );
};
