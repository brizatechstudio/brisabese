import React, { useEffect, useState } from 'react';
import { Check, Copy, Database, Gauge, Globe2, KeyRound, LockKeyhole, Network, Server, ShieldCheck } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { useApp } from '../../context/AppContext';
import { isRealMode, realDatabaseService } from '../../services/runtime';
import type { DatabaseOverview } from '../../brisabase/types';

const connectionModes = [
  {
    title: 'Direct connection',
    subtitle: 'Sessões longas, migrations e ferramentas administrativas',
    port: '5432',
    icon: Database,
    status: 'Disponível'
  },
  {
    title: 'Session Pooler',
    subtitle: 'Pool compatível com ORMs e aplicações persistentes',
    port: '6543',
    icon: Network,
    status: 'Ativo'
  },
  {
    title: 'Transaction Pooler',
    subtitle: 'Serverless e alto volume de conexões curtas',
    port: '7654',
    icon: Gauge,
    status: 'Ativo'
  }
];

const MockSqlConnections: React.FC = () => {
  const { activeProject, showToast } = useApp();
  const [copied, setCopied] = useState<string | null>(null);
  const [sslRequired, setSslRequired] = useState(true);
  const [ipv4Addon, setIpv4Addon] = useState(false);

  const slug = activeProject?.slug || 'brisabase-demo';
  const password = '••••••••••••••••';
  const connectionString = `postgresql://postgres:${password}@db.${slug}.brisabase.dev:5432/postgres?sslmode=require`;

  const copy = (id: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(id);
    showToast('Copiado', 'Valor simulado copiado para a área de transferência.', 'info');
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-slate-100">Conexões PostgreSQL</h2>
            <Badge variant="cyan" size="sm">mock</Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">Strings de conexão, pooler, SSL, rede e réplicas representados sem abrir uma conexão real.</p>
        </div>
        <Button variant="outline" size="sm" leftIcon={<KeyRound className="w-3.5 h-3.5" />} onClick={() => showToast('Senha rotacionada', 'Nova credencial simulada gerada para o projeto.', 'success')}>
          Rotacionar senha
        </Button>
      </div>

      <div className="rounded-2xl bg-[#020617] border border-white/[0.08] p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-xs font-bold text-slate-200">Connection string</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Database `postgres` • schema `public` • SSL required</div>
          </div>
          <button onClick={() => copy('url', connectionString)} className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] text-slate-300">
            {copied === 'url' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <code className="block overflow-x-auto rounded-xl bg-[#07111F] border border-white/[0.06] px-4 py-3 text-xs text-cyan-300 font-mono">{connectionString}</code>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        {connectionModes.map((mode) => {
          const Icon = mode.icon;
          return (
            <div key={mode.title} className="rounded-2xl bg-[#07111F] border border-white/[0.08] p-4">
              <div className="flex items-start justify-between gap-3">
                <span className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/15 grid place-items-center"><Icon className="w-4 h-4 text-cyan-400" /></span>
                <Badge variant="success" size="sm">{mode.status}</Badge>
              </div>
              <h3 className="text-sm font-bold text-slate-100 mt-4">{mode.title}</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{mode.subtitle}</p>
              <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
                <span>Porta</span><span className="font-mono text-slate-300">{mode.port}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-[#07111F] border border-white/[0.08] p-4 space-y-4">
          <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-cyan-400" /><h3 className="text-sm font-bold text-slate-100">Network & SSL</h3></div>
          <label className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div><div className="text-xs font-semibold text-slate-200">Require SSL</div><div className="text-[11px] text-slate-500">Rejeita conexões sem TLS.</div></div>
            <input type="checkbox" checked={sslRequired} onChange={(e) => setSslRequired(e.target.checked)} className="accent-cyan-500" />
          </label>
          <label className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div><div className="text-xs font-semibold text-slate-200">Dedicated IPv4</div><div className="text-[11px] text-slate-500">IP fixo para allowlists legadas.</div></div>
            <input type="checkbox" checked={ipv4Addon} onChange={(e) => setIpv4Addon(e.target.checked)} className="accent-cyan-500" />
          </label>
          <div className="flex items-center gap-2 text-[11px] text-slate-500"><LockKeyhole className="w-3.5 h-3.5" /> Certificado CA e fingerprint disponíveis no modo real.</div>
        </div>

        <div className="rounded-2xl bg-[#07111F] border border-white/[0.08] p-4">
          <div className="flex items-center gap-2"><Server className="w-4 h-4 text-cyan-400" /><h3 className="text-sm font-bold text-slate-100">Read replicas</h3></div>
          <div className="mt-4 space-y-3">
            {[
              ['Primary', 'São Paulo • sa-east-1', 'Read/Write', '4 ms'],
              ['Replica #1', 'Virginia • us-east-1', 'Read only', '86 ms'],
              ['Replica #2', 'Frankfurt • eu-central-1', 'Read only', '142 ms']
            ].map(([name, region, mode, lag]) => (
              <div key={name} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                <div className="flex items-center gap-3"><Globe2 className="w-4 h-4 text-cyan-400" /><div><div className="text-xs font-semibold text-slate-200">{name}</div><div className="text-[11px] text-slate-500">{region}</div></div></div>
                <div className="text-right"><div className="text-[11px] text-slate-300">{mode}</div><div className="text-[10px] text-emerald-400">lag {lag}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};


const RealSqlConnections: React.FC = () => {
  const { activeProject, showToast } = useApp();
  const [overview, setOverview] = useState<DatabaseOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setOverview(await realDatabaseService.getOverview());
    } catch (error) {
      showToast('PostgreSQL indisponível', error instanceof Error ? error.message : 'Falha ao consultar o banco real.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (activeProject?.id) void load(); }, [activeProject?.id]);

  const copyApi = async () => {
    const value = `${window.location.origin}/rest/v1/`;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    showToast('Endpoint copiado', 'A REST API do projeto usa a chave pública/service key e o escopo do ambiente.', 'info');
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-slate-100">Conexões PostgreSQL</h2>
            <Badge variant={overview?.status === 'connected' ? 'success' : 'warning'} size="sm">REAL</Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">PostgreSQL do runtime local. Credenciais administrativas ficam somente no servidor e nunca são expostas ao navegador.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>{loading ? 'Verificando…' : 'Atualizar status'}</Button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          ['Status', overview?.status || 'verificando'],
          ['Versão', overview?.version || 'PostgreSQL'],
          ['Conexões', `${overview?.activeConnections ?? 0}/${overview?.maxConnections ?? '—'}`],
          ['Tabelas', String(overview?.tableCount ?? 0)]
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-[#07111F] border border-white/[0.08] p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
            <div className="mt-2 text-sm font-semibold text-slate-100 break-words">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-[#020617] border border-white/[0.08] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400"/><h3 className="text-sm font-bold text-slate-100">Acesso seguro ao banco</h3></div>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-400">O runtime herdado usa uma conexão PostgreSQL configurada no servidor e schemas isolados por projeto/ambiente. O painel opera pelo Control Plane autenticado e pelo SQL Editor com escopo; uma connection string direta por cliente ainda não é publicada pelo BrisaBase.</p>
          </div>
          <Badge variant="success" size="sm">segredo server-side</Badge>
        </div>
        <div className="mt-4 grid md:grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3"><Database className="w-4 h-4 text-cyan-400"/><div className="mt-2 text-xs font-semibold">SQL Editor real</div><div className="text-[11px] text-slate-500 mt-1">DDL/DML executados no schema do tenant.</div></div>
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3"><LockKeyhole className="w-4 h-4 text-cyan-400"/><div className="mt-2 text-xs font-semibold">RLS & isolamento</div><div className="text-[11px] text-slate-500 mt-1">Policies e escopo de projeto ficam no backend.</div></div>
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3"><Server className="w-4 h-4 text-cyan-400"/><div className="mt-2 text-xs font-semibold">REST data plane</div><div className="text-[11px] text-slate-500 mt-1">API pública sobre tabelas autorizadas.</div></div>
        </div>
      </div>

      <div className="rounded-2xl bg-[#07111F] border border-white/[0.08] p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div><div className="text-xs font-bold text-slate-200">REST endpoint local</div><div className="text-[11px] text-slate-500 mt-0.5">Use SDK/API keys do projeto; não é uma senha PostgreSQL.</div></div>
          <button onClick={() => void copyApi()} className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] text-slate-300">{copied ? <Check className="w-4 h-4 text-emerald-400"/> : <Copy className="w-4 h-4"/>}</button>
        </div>
        <code className="block overflow-x-auto rounded-xl bg-[#020617] border border-white/[0.06] px-4 py-3 text-xs text-cyan-300 font-mono">{typeof window !== 'undefined' ? `${window.location.origin}/rest/v1/:table` : '/rest/v1/:table'}</code>
      </div>

      <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-4 text-xs text-amber-100/80">
        <strong>Não simulado no modo real:</strong> pooler público, IP dedicado e read replicas. Esses recursos continuam no roadmap/mock avançado e só serão marcados como reais quando houver infraestrutura correspondente.
      </div>
    </div>
  );
};

export const SqlConnections: React.FC = () => isRealMode ? <RealSqlConnections /> : <MockSqlConnections />;
