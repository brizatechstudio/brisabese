import React, { useCallback, useEffect, useState } from 'react';
import { GitBranch, Plus, RefreshCw, Save, DatabaseZap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useApp } from '../context/AppContext';
import { configureRealProjectScope } from '../services/runtime';

type EnvironmentRow = {
  id: string;
  project_id: string;
  name: string;
  type: 'development' | 'staging' | 'production';
  status?: string;
  created_at?: string;
  updated_at?: string;
};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || `Environment request failed (${response.status}).`);
  return payload as T;
}

export const EnvironmentsReal: React.FC = () => {
  const { activeProject, showToast, refreshProjects } = useApp();
  const navigate = useNavigate();
  const [items, setItems] = useState<EnvironmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('Development');
  const [type, setType] = useState<EnvironmentRow['type']>('development');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!activeProject) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try {
      setItems(await jsonRequest<EnvironmentRow[]>(`/api/projects/${activeProject.id}/environments`));
    } catch (error) {
      showToast('Ambientes', error instanceof Error ? error.message : 'Falha ao carregar ambientes.', 'error');
    } finally { setLoading(false); }
  }, [activeProject, showToast]);

  useEffect(() => { void load(); }, [load]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeProject || !name.trim()) return;
    setBusy(true);
    try {
      await jsonRequest(`/api/projects/${activeProject.id}/environments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), type })
      });
      showToast('Ambiente criado', `${name.trim()} foi persistido no control plane.`, 'success');
      setName(type === 'production' ? 'Production' : type === 'staging' ? 'Staging' : 'Development');
      await load();
    } catch (error) {
      showToast('Falha ao criar ambiente', error instanceof Error ? error.message : undefined, 'error');
    } finally { setBusy(false); }
  };

  const update = async (item: EnvironmentRow, patch: Partial<Pick<EnvironmentRow, 'name' | 'status'>>) => {
    try {
      await jsonRequest(`/api/environments/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch)
      });
      await load();
      await refreshProjects();
      showToast('Ambiente atualizado', item.name, 'success');
    } catch (error) {
      showToast('Falha ao atualizar', error instanceof Error ? error.message : undefined, 'error');
    }
  };

  const activate = async (item: EnvironmentRow) => {
    if (!activeProject) return;
    localStorage.setItem(`brisabase_environment_id:${activeProject.id}`, item.id);
    activeProject.environmentId = item.id;
    activeProject.category = item.type;
    await configureRealProjectScope(activeProject);
    showToast('Ambiente ativo alterado', `${item.name} (${item.type})`, 'info');
  };

  const activeId = activeProject?.environmentId || localStorage.getItem('brisabase.environmentId');

  return <div className="space-y-6 animate-in fade-in duration-300">
    <PageHeader
      title="Ambientes & Branches"
      subtitle="Ambientes reais do projeto e bancos de preview isolados do runtime local."
      badge={<Badge variant="cyan" dot>{activeProject?.name || 'Nenhum projeto'}</Badge>}
      actions={<Button variant="outline" size="sm" onClick={() => void load()} leftIcon={<RefreshCw className="w-4 h-4" />}>Atualizar</Button>}
    />

    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <section className="rounded-2xl border border-white/[0.08] bg-[#07111F] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div><h2 className="text-sm font-bold text-slate-100">Ambientes persistidos</h2><p className="mt-1 text-xs text-slate-500">O ambiente selecionado define o escopo de Database, Auth, Storage, Functions, Security e observabilidade.</p></div>
          <GitBranch className="h-5 w-5 text-cyan-400" />
        </div>
        {loading ? <div className="py-10 text-center text-sm text-slate-500">Carregando ambientes reais…</div> : (
          <div className="space-y-3">
            {items.map((item) => <div key={item.id} className={`rounded-xl border p-4 ${activeId === item.id ? 'border-cyan-500/40 bg-cyan-500/[0.05]' : 'border-white/[0.07] bg-[#0B1628]'}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2"><span className="font-semibold text-slate-100">{item.name}</span><Badge variant={activeId === item.id ? 'success' : 'neutral'}>{item.type}</Badge>{activeId === item.id && <span className="text-[10px] font-bold uppercase text-cyan-300">ativo</span>}</div>
                  <div className="mt-1 font-mono text-[11px] text-slate-500">{item.id}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant={activeId === item.id ? 'secondary' : 'outline'} onClick={() => void activate(item)}>Usar ambiente</Button>
                  <Button size="sm" variant="outline" onClick={() => void update(item, { status: item.status === 'paused' ? 'active' : 'paused' })}>{item.status === 'paused' ? 'Ativar' : 'Pausar'}</Button>
                </div>
              </div>
            </div>)}
            {!items.length && <div className="rounded-xl border border-dashed border-white/10 py-10 text-center text-sm text-slate-500">Nenhum ambiente encontrado.</div>}
          </div>
        )}
      </section>

      <div className="space-y-4">
        <form onSubmit={create} className="rounded-2xl border border-white/[0.08] bg-[#07111F] p-5 space-y-4">
          <div className="flex items-center gap-2"><Plus className="h-4 w-4 text-cyan-400"/><h2 className="text-sm font-bold text-slate-100">Novo ambiente</h2></div>
          <Input label="Nome" value={name} onChange={(event) => setName(event.target.value)} />
          <div><label className="mb-1.5 block text-xs font-semibold text-slate-300">Tipo</label><select value={type} onChange={(event) => setType(event.target.value as EnvironmentRow['type'])} className="w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2.5 text-sm text-slate-100"><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></select></div>
          <Button type="submit" variant="gradient" size="sm" isLoading={busy} leftIcon={<Save className="w-4 h-4"/>}>Criar ambiente</Button>
        </form>
        <button onClick={() => navigate('/previews')} className="w-full rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.04] p-5 text-left transition hover:bg-cyan-500/[0.07]">
          <div className="flex items-center gap-2 text-sm font-bold text-cyan-300"><DatabaseZap className="h-4 w-4"/>Preview Database</div>
          <p className="mt-2 text-xs leading-5 text-slate-400">Abra o gerenciador real de bancos temporários/branches isolados que já existia no BrisaBase.</p>
        </button>
      </div>
    </div>
  </div>;
};
