import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Plus, Trash2, Play, Power } from 'lucide-react';
import { TableSchema, DatabasePolicy } from '../../types';
import { useApp } from '../../../context/AppContext';

export const DatabasePoliciesView: React.FC<{ tables: TableSchema[] }> = ({ tables }) => {
  const { addToast, activeOrganizationId, activeProjectId, activeEnvironmentId } = useApp();
  const [policies, setPolicies] = useState<DatabasePolicy[]>([]);
  const [table, setTable] = useState('');
  const [operation, setOperation] = useState<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'>('SELECT');
  const [name, setName] = useState('Usuário acessa os próprios dados');
  const [condition, setCondition] = useState('owner_id = auth.uid()');
  const [simulation, setSimulation] = useState<any>(null);

  const scopeHeaders = useMemo(() => ({
    'x-organization-id': activeOrganizationId || '',
    'x-project-id': activeProjectId || '',
    'x-environment-id': activeEnvironmentId || '',
  }), [activeOrganizationId, activeProjectId, activeEnvironmentId]);

  const request = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    if (!activeOrganizationId || !activeProjectId || !activeEnvironmentId) throw new Error('Selecione organização, projeto e ambiente antes de gerenciar policies.');
    const response = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...scopeHeaders, ...(init?.headers || {}) },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message || 'Security request failed.');
    return data as T;
  };

  const load = async () => {
    if (!activeOrganizationId || !activeProjectId || !activeEnvironmentId) { setPolicies([]); return; }
    try { setPolicies(await request<DatabasePolicy[]>('/api/security/policies?resourceType=table')); }
    catch (error: any) { addToast('RLS', error.message, 'error'); }
  };

  useEffect(() => { void load(); }, [activeOrganizationId, activeProjectId, activeEnvironmentId]);
  useEffect(() => { if (!table && tables[0]) setTable(tables[0].name); }, [table, tables]);

  const suggest = (op: string) => op === 'INSERT'
    ? 'new.owner_id = auth.uid()'
    : op === 'UPDATE'
      ? 'owner_id = auth.uid() and new.owner_id = auth.uid()'
      : 'owner_id = auth.uid()';

  const create = async () => {
    try {
      await request('/api/security/policies', { method: 'POST', body: JSON.stringify({ name, resourceType: 'table', resource: table, operation, condition, enabled: true }) });
      await load();
      addToast('Policy criada', `${operation} em ${table}`, 'success');
    } catch (error: any) { addToast('Falha ao criar policy', error.message, 'error'); }
  };

  const simulate = async () => {
    try {
      setSimulation(await request('/api/security/simulate', { method: 'POST', body: JSON.stringify({ context: { userId: 'example-user', role: 'authenticated' }, input: { resourceType: 'table', resource: table, operation, row: { owner_id: 'example-user' }, proposedRow: { owner_id: 'example-user' } } }) }));
    } catch (error: any) { addToast('Simulação', error.message, 'error'); }
  };

  const toggle = async (policy: DatabasePolicy) => {
    try { await request(`/api/security/policies/${policy.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !policy.enabled }) }); await load(); }
    catch (error: any) { addToast('Falha ao atualizar policy', error.message, 'error'); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Excluir esta policy de Database?')) return;
    try { await request(`/api/security/policies/${id}`, { method: 'DELETE' }); await load(); }
    catch (error: any) { addToast('Falha ao remover policy', error.message, 'error'); }
  };

  return <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
    <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-purple-400"/><h3 className="text-sm font-semibold">Nova policy de tabela</h3></div>
      <select value={table} onChange={e => setTable(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs">{tables.map(t => <option key={t.name}>{t.name}</option>)}</select>
      <select value={operation} onChange={e => { const op = e.target.value as typeof operation; setOperation(op); setCondition(suggest(op)); }} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs">{['SELECT', 'INSERT', 'UPDATE', 'DELETE'].map(x => <option key={x}>{x}</option>)}</select>
      <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs"/>
      <input value={condition} onChange={e => setCondition(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs"/>
      <p className="text-[10px] text-slate-500">BrisaBase RLS é aplicada no data-plane por projeto/ambiente. Sem policy correspondente, o acesso de usuários do app é negado por padrão.</p>
      <button onClick={() => void create()} disabled={!table || !condition.trim()} className="flex w-full items-center justify-center gap-1 rounded bg-purple-600 py-2 text-xs font-semibold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5"/>Criar policy</button>
      <button onClick={() => void simulate()} disabled={!table} className="flex w-full items-center justify-center gap-1 rounded border border-slate-700 py-2 text-xs text-slate-300"><Play className="h-3.5 w-3.5"/>Simular usuário</button>
      {simulation && <div className={`rounded p-2 text-xs ${simulation.allowed ? 'bg-emerald-950/40 text-emerald-300' : 'bg-rose-950/40 text-rose-300'}`}>{simulation.allowed ? 'Acesso permitido' : 'Acesso negado'}{simulation.reason ? ` · ${simulation.reason}` : ''}</div>}
    </section>
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h3 className="mb-3 text-sm font-semibold">Policies de Database ({policies.length})</h3>
      <div className="space-y-2">{policies.length === 0 ? <p className="text-xs text-slate-500">Nenhuma policy de tabela criada.</p> : policies.map(p => <div key={p.id} className="flex items-start justify-between rounded-lg border border-slate-800 bg-slate-950 p-3">
        <div><div className="flex items-center gap-2"><p className="text-xs font-semibold text-slate-200">{p.name}</p><span className={`rounded px-1.5 py-0.5 text-[9px] ${p.enabled ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>{p.enabled ? 'ativa' : 'desativada'}</span></div><p className="mt-1 font-mono text-[10px] text-purple-300">{p.operation} {p.resource}</p><p className="mt-1 font-mono text-[10px] text-slate-500">when {p.condition}</p></div>
        <div className="flex gap-1"><button onClick={() => void toggle(p)} title={p.enabled ? 'Desativar' : 'Ativar'} className="p-1 text-slate-600 hover:text-cyan-400"><Power className="h-3.5 w-3.5"/></button><button onClick={() => void remove(p.id)} className="p-1 text-slate-600 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5"/></button></div>
      </div>)}</div>
    </section>
  </div>;
};
