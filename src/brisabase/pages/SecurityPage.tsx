import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Play, Plus, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

type ResourceType = 'table' | 'storage';
type Operation = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
type Policy = {
  id: string;
  name: string;
  resourceType: ResourceType;
  resource: string;
  operation: Operation;
  condition: string;
  enabled: boolean;
  updatedAt: string;
};

const operations: Operation[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

function suggestedCondition(resourceType: ResourceType, operation: Operation): string {
  if (resourceType === 'storage') {
    if (operation === 'INSERT') return "auth.role() = 'authenticated' and new.owner_id = auth.uid()";
    if (operation === 'UPDATE') return 'owner_id = auth.uid() and new.owner_id = auth.uid()';
    return 'owner_id = auth.uid()';
  }

  if (operation === 'INSERT') return 'new.owner_id = auth.uid()';
  if (operation === 'UPDATE') return 'owner_id = auth.uid() and new.owner_id = auth.uid()';
  return 'owner_id = auth.uid()';
}

function suggestedResource(resourceType: ResourceType): string {
  return resourceType === 'storage' ? 'teste/*' : 'orders';
}

export const SecurityPage: React.FC = () => {
  const { addToast } = useApp();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [name, setName] = useState('Usuários acessam apenas os próprios dados');
  const [resourceType, setResourceType] = useState<ResourceType>('table');
  const [resource, setResource] = useState('orders');
  const [operation, setOperation] = useState<Operation>('SELECT');
  const [condition, setCondition] = useState('owner_id = auth.uid()');
  const [result, setResult] = useState<{ allowed: boolean; reason?: string } | null>(null);
  const headers = { 'Content-Type': 'application/json' };

  const resourceHelp = useMemo(() => {
    if (resourceType === 'storage') {
      return 'Use bucket/caminho. Ex.: teste/* aplica a policy a todos os objetos do bucket teste.';
    }
    return 'Informe o nome da tabela. Ex.: orders, tab1.';
  }, [resourceType]);

  const request = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url, { ...init, headers: { ...headers, ...(init?.headers || {}) } });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message || 'Security request failed.');
    return data as T;
  };

  const load = async () => {
    try {
      setPolicies(await request<Policy[]>('/api/security/policies'));
    } catch (error: any) {
      addToast('Security', error.message, 'error');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const changeResourceType = (next: ResourceType) => {
    setResourceType(next);
    setResource(suggestedResource(next));
    setCondition(suggestedCondition(next, operation));
    setResult(null);
  };

  const changeOperation = (next: Operation) => {
    setOperation(next);
    setCondition(suggestedCondition(resourceType, next));
    setResult(null);
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await request('/api/security/policies', {
        method: 'POST',
        body: JSON.stringify({
          name,
          resourceType,
          resource: resource.trim(),
          operation,
          condition: condition.trim(),
          enabled: true,
        }),
      });
      addToast('Policy criada', `A regra de ${resourceType === 'storage' ? 'Storage' : 'tabela'} está ativa para este ambiente.`, 'success');
      setResult(null);
      await load();
    } catch (error: any) {
      addToast('Não foi possível criar a policy', error.message, 'error');
    }
  };

  const simulate = async () => {
    try {
      const userId = 'example-user';
      const storagePath = `${userId}/arquivo-teste.png`;
      const simulatedResource = resourceType === 'storage'
        ? resource.trim().replace('*', storagePath)
        : resource.trim();
      const row = resourceType === 'storage'
        ? { path: storagePath, owner_id: userId }
        : { user_id: userId, owner_id: userId };
      const proposedRow = { ...row };

      setResult(await request('/api/security/simulate', {
        method: 'POST',
        body: JSON.stringify({
          context: { userId, role: 'authenticated' },
          input: {
            resourceType,
            resource: simulatedResource,
            operation,
            row,
            proposedRow,
            path: resourceType === 'storage' ? storagePath : undefined,
          },
        }),
      }));
    } catch (error: any) {
      addToast('Simulação falhou', error.message, 'error');
    }
  };

  const remove = async (id: string) => {
    try {
      await request(`/api/security/policies/${id}`, { method: 'DELETE' });
      await load();
    } catch (error: any) {
      addToast('Não foi possível excluir', error.message, 'error');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="rounded-xl border border-purple-500/30 bg-gradient-to-r from-purple-950/50 to-slate-900 p-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-purple-300" />
          <div>
            <h1 className="text-xl font-semibold text-white">Security & Row Level Security</h1>
            <p className="mt-1 text-sm text-slate-400">Políticas compiladas uma vez e aplicadas em Database, API, Realtime e Storage.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <form onSubmit={create} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="font-medium text-white">Nova policy</h2>

          <label className="block text-sm text-slate-400">
            Nome
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 p-2 text-white"
            />
          </label>

          <label className="block text-sm text-slate-400">
            Tipo de recurso
            <select
              value={resourceType}
              onChange={(event) => changeResourceType(event.target.value as ResourceType)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 p-2 text-white"
            >
              <option value="table">Tabela / Database</option>
              <option value="storage">Storage / Arquivos</option>
            </select>
          </label>

          <label className="block text-sm text-slate-400">
            {resourceType === 'storage' ? 'Bucket / objeto' : 'Tabela'}
            <input
              value={resource}
              onChange={(event) => setResource(event.target.value)}
              placeholder={resourceType === 'storage' ? 'teste/*' : 'tab1'}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 p-2 font-mono text-sm text-white"
            />
            <span className="mt-1 block text-xs text-slate-500">{resourceHelp}</span>
          </label>

          <label className="block text-sm text-slate-400">
            Operação
            <select
              value={operation}
              onChange={(event) => changeOperation(event.target.value as Operation)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 p-2 text-white"
            >
              {operations.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>

          <label className="block text-sm text-slate-400">
            Condição
            <input
              value={condition}
              onChange={(event) => setCondition(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 p-2 font-mono text-sm text-white"
            />
            {resourceType === 'storage' && (
              <span className="mt-1 block text-xs text-slate-500">
                Para objetos privados, owner_id = auth.uid() limita leitura/alteração ao usuário dono do arquivo.
              </span>
            )}
          </label>

          <button className="flex w-full items-center justify-center gap-2 rounded-md bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500">
            <Plus className="h-4 w-4" /> Compilar e criar
          </button>

          <button
            type="button"
            onClick={simulate}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            <Play className="h-4 w-4" /> Simular usuário
          </button>

          {result && (
            <div className={`flex gap-2 rounded-md p-3 text-sm ${result.allowed ? 'bg-emerald-950 text-emerald-300' : 'bg-red-950 text-red-300'}`}>
              {result.allowed ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
              {result.allowed ? 'Acesso permitido' : result.reason || 'Acesso negado'}
            </div>
          )}
        </form>

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="mb-4 font-medium text-white">Policies ativas</h2>
          <div className="space-y-3">
            {policies.length === 0 && (
              <p className="text-sm text-slate-500">Nenhuma policy criada. Em ambiente real, recursos sem policy são negados por padrão.</p>
            )}
            {policies.map((policy) => (
              <div key={policy.id} className="flex items-start justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                <div>
                  <p className="font-medium text-white">{policy.name}</p>
                  <p className="mt-1 font-mono text-xs text-purple-300">
                    {policy.operation} {policy.resourceType}:{policy.resource}
                  </p>
                  <p className="mt-2 font-mono text-xs text-slate-400">when {policy.condition}</p>
                </div>
                <button
                  onClick={() => void remove(policy.id)}
                  className="p-2 text-slate-500 hover:text-red-300"
                  aria-label="Excluir policy"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
