import React, { FormEvent, useEffect, useState } from 'react';
import { GitBranch, Plus, RefreshCw, Trash2, Database, Clock3 } from 'lucide-react';
import { previewDatabaseService, PreviewEnvironment } from '../services/platformCompletionService';

export const PreviewDatabasePage: React.FC = () => {
  const [items, setItems] = useState<PreviewEnvironment[]>([]);
  const [branchName, setBranchName] = useState('feature-');
  const [includeData, setIncludeData] = useState(false);
  const [ttlHours, setTtlHours] = useState(72);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try { setItems(await previewDatabaseService.list()); }
    catch (cause: any) { setError(cause?.message || 'Não foi possível carregar os Preview Databases.'); }
  };

  useEffect(() => { void load(); }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const value = branchName.trim();
    if (!value) return;
    setBusy(true); setError(null);
    try {
      await previewDatabaseService.create({ branchName: value, includeData, ttlHours });
      setBranchName('feature-');
      await load();
    } catch (cause: any) { setError(cause?.message || 'Falha ao criar Preview Database.'); }
    finally { setBusy(false); }
  };

  const remove = async (item: PreviewEnvironment) => {
    if (!confirm(`Excluir o Preview Database “${item.branchName}”? O schema isolado será removido.`)) return;
    setBusy(true); setError(null);
    try { await previewDatabaseService.remove(item.id); await load(); }
    catch (cause: any) { setError(cause?.message || 'Falha ao excluir Preview Database.'); }
    finally { setBusy(false); }
  };

  const cleanup = async () => {
    setBusy(true); setError(null);
    try { await previewDatabaseService.cleanupExpired(); await load(); }
    catch (cause: any) { setError(cause?.message || 'Falha ao limpar previews expirados.'); }
    finally { setBusy(false); }
  };

  const ready = items.filter((item) => item.status === 'ready').length;
  const withData = items.filter((item) => item.includeData && item.status === 'ready').length;

  return <div className="space-y-6 pb-12">
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-100"><GitBranch className="h-5 w-5 text-purple-400"/>Branch / Preview Database</h1>
        <p className="mt-1 text-xs text-slate-400">Crie ambientes PostgreSQL isolados por branch, com schema, políticas RLS e expiração automática.</p>
      </div>
      <button onClick={cleanup} disabled={busy} className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"><RefreshCw className="h-4 w-4"/>Limpar expirados</button>
    </div>

    {error && <div className="rounded-xl border border-red-800 bg-red-950/50 p-4 text-sm text-red-300">{error}</div>}

    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"><span className="text-xs text-slate-500">Previews prontos</span><div className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-100"><Database className="h-5 w-5 text-emerald-400"/>{ready}</div></div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"><span className="text-xs text-slate-500">Com cópia de dados</span><div className="mt-2 text-2xl font-bold text-cyan-300">{withData}</div></div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"><span className="text-xs text-slate-500">TTL padrão</span><div className="mt-2 flex items-center gap-2 text-2xl font-bold text-purple-300"><Clock3 className="h-5 w-5"/>72h</div></div>
    </div>

    <form onSubmit={create} className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 md:grid-cols-[1fr_140px_auto_auto] md:items-end">
      <label className="space-y-1.5 text-xs text-slate-400">Branch
        <input value={branchName} onChange={(e)=>setBranchName(e.target.value)} placeholder="feature-checkout" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-purple-500"/>
      </label>
      <label className="space-y-1.5 text-xs text-slate-400">Expira em (horas)
        <input type="number" min={1} max={720} value={ttlHours} onChange={(e)=>setTtlHours(Number(e.target.value)||72)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100"/>
      </label>
      <label className="flex items-center gap-2 pb-2 text-xs text-slate-300"><input type="checkbox" checked={includeData} onChange={(e)=>setIncludeData(e.target.checked)} className="h-4 w-4"/>Copiar dados</label>
      <button disabled={busy||!branchName.trim()} className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-50"><Plus className="h-4 w-4"/>Criar preview</button>
    </form>

    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-800 bg-slate-950/70 text-slate-500"><tr><th className="px-4 py-3">Branch</th><th className="px-4 py-3">Ambiente</th><th className="px-4 py-3">Dados</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Expiração</th><th className="px-4 py-3 text-right">Ação</th></tr></thead>
        <tbody className="divide-y divide-slate-800/70">{items.length===0?<tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Nenhum Preview Database criado.</td></tr>:items.map((item)=><tr key={item.id} className="hover:bg-slate-800/30"><td className="px-4 py-3 font-mono font-semibold text-slate-200">{item.branchName}</td><td className="px-4 py-3 font-mono text-slate-400">{item.previewEnvironmentId}</td><td className="px-4 py-3 text-slate-300">{item.includeData?'schema + dados':'somente schema'}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${item.status==='ready'?'bg-emerald-950 text-emerald-300':'bg-slate-800 text-slate-300'}`}>{item.status}</span>{item.errorMessage&&<div className="mt-1 max-w-xs text-[10px] text-red-300">{item.errorMessage}</div>}</td><td className="px-4 py-3 text-slate-400">{item.expiresAt?new Date(item.expiresAt).toLocaleString('pt-BR'):'—'}</td><td className="px-4 py-3 text-right"><button onClick={()=>void remove(item)} disabled={busy||['deleted','expired'].includes(item.status)} className="rounded-lg p-2 text-slate-500 hover:bg-red-950/50 hover:text-red-300 disabled:opacity-30"><Trash2 className="h-4 w-4"/></button></td></tr>)}</tbody>
      </table>
    </div>
  </div>;
};
