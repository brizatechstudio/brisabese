import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Database,
  Users,
  Code2,
  Cpu,
  Settings,
  BookOpen,
  FolderTree,
  ArrowRight,
  X,
  ShieldCheck,
  GitBranch,
  Wrench,
  Globe2,
  BellRing,
  Gauge,
  Layers3,
  Radio,
  BarChart3,
  Terminal,
  Flag,
  Smartphone,
  Sparkles,
  Building2
} from 'lucide-react';

export const GlobalSearch: React.FC = () => {
  const { isSearchOpen, setIsSearchOpen, projects, setActiveProject, language } = useApp();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!isSearchOpen) setQuery('');
  }, [isSearchOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setIsSearchOpen]);

  if (!isSearchOpen) return null;

  const isEnglish = language === 'en-US';

  const quickLinks = [
    { title: 'Visão Geral', path: '/', icon: Cpu, category: 'Navegação' },
    { title: 'Projetos', path: '/projects', icon: FolderTree, category: 'Navegação' },
    { title: 'Banco de Dados • Table Editor', path: '/database', icon: Database, category: 'Core BaaS' },
    { title: 'SQL Editor • PostgreSQL', path: '/database/sql', icon: Code2, category: 'Core BaaS' },
    { title: 'NoSQL • Collections & Documents', path: '/database/nosql', icon: FolderTree, category: 'Core BaaS' },
    { title: 'Database Connections & Pooler', path: '/database/connections', icon: Globe2, category: 'Core BaaS' },
    { title: 'Gerenciar Usuários & Auth', path: '/auth', icon: Users, category: 'Core BaaS' },
    { title: 'Storage', path: '/storage', icon: FolderTree, category: 'Core BaaS' },
    { title: 'Funções Serverless', path: '/functions', icon: Code2, category: 'Core BaaS' },
    { title: 'Realtime', path: '/realtime', icon: Radio, category: 'Core BaaS' },
    { title: 'APIs & Endpoints', path: '/apis', icon: Globe2, category: 'Core BaaS' },
    { title: 'Data Platform • Schema, Functions, Views, Replication, Performance', path: '/data-platform', icon: Layers3, category: 'Plataforma' },
    { title: 'Identity & Security • Policies, MFA, RBAC, Compliance', path: '/security', icon: ShieldCheck, category: 'Plataforma' },
    { title: 'Environments, Branching & HA/DR', path: '/environments', icon: GitBranch, category: 'Plataforma' },
    { title: 'SDK, CLI, IaC & Developer Tools', path: '/developer-tools', icon: Wrench, category: 'Plataforma' },
    { title: 'Hosting, Domains & Edge', path: '/hosting', icon: Globe2, category: 'Plataforma' },
    { title: 'Messaging, Remote Config & Flags', path: '/messaging', icon: BellRing, category: 'Plataforma' },
    { title: 'Experiments • A/B Testing, Rollouts & Personalization', path: '/experiments', icon: Flag, category: 'Ecossistema' },
    { title: 'App Quality • Distribution, Testers & Test Lab', path: '/app-quality', icon: Smartphone, category: 'Ecossistema' },
    { title: 'Search & AI • Hybrid Search, AI Gateway, RAG & Evals', path: '/search-ai', icon: Sparkles, category: 'Ecossistema' },
    { title: 'Enterprise • Organizations, SCIM, SIEM & SLA', path: '/enterprise', icon: Building2, category: 'Ecossistema' },
    { title: 'Analytics', path: '/analytics', icon: BarChart3, category: 'Operação' },
    { title: 'Logs & Eventos', path: '/logs', icon: Terminal, category: 'Operação' },
    { title: 'Uso, APM, Incidents & Cost Control', path: '/usage', icon: Gauge, category: 'Operação' },
    { title: 'Configurações & API Keys', path: '/settings', icon: Settings, category: 'Configurações' },
    { title: 'Guia SDK & Documentação', path: '/docs', icon: BookOpen, category: 'Documentação' }
  ];

  const filteredLinks = query.trim()
    ? quickLinks.filter(
        (l) =>
          l.title.toLowerCase().includes(query.toLowerCase()) ||
          l.category.toLowerCase().includes(query.toLowerCase())
      )
    : quickLinks;

  const filteredProjects = query.trim()
    ? projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : projects.slice(0, 3);

  const handleSelect = (path: string) => {
    setIsSearchOpen(false);
    navigate(path);
  };

  const handleSelectProject = (proj: (typeof projects)[number]) => {
    setActiveProject(proj);
    setIsSearchOpen(false);
    navigate('/');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 sm:p-6">
      <div className="fixed inset-0 bg-[#020617]/80 backdrop-blur-md transition-opacity" onClick={() => setIsSearchOpen(false)} />

      <div className="relative w-full max-w-2xl rounded-2xl bg-[#07111F] border border-white/15 shadow-2xl z-10 overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 p-4 border-b border-white/[0.08] bg-[#0B1628]">
          <Search className="w-5 h-5 text-cyan-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isEnglish ? 'Search SQL Editor, experiments, Test Lab, Search, AI, SCIM, database...' : 'Buscar SQL Editor, experimentos, Test Lab, Search, AI, SCIM, banco...'}
            className="w-full bg-transparent border-none text-slate-100 placeholder:text-slate-500 text-sm focus:outline-none focus:ring-0"
            autoFocus
          />
          {query && <button onClick={() => setQuery('')} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>}
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/[0.08] text-slate-400">ESC</span>
        </div>

        <div className="p-3 overflow-y-auto space-y-4">
          {filteredProjects.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{isEnglish ? 'Projects' : 'Projetos'}</div>
              <div className="space-y-1 mt-1">
                {filteredProjects.map((p) => (
                  <button key={p.id} onClick={() => handleSelectProject(p)} className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/[0.06] text-left text-xs transition-colors group">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-md flex items-center justify-center font-bold text-white text-xs" style={{ backgroundColor: p.iconColor }}>{p.name[0]}</span>
                      <div>
                        <span className="font-semibold text-slate-200 group-hover:text-cyan-300">{p.name}</span>
                        <span className="text-slate-500 text-[11px] ml-2">{p.region}</span>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition-transform group-hover:translate-x-1" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{isEnglish ? 'Resources & Screens' : 'Recursos & Telas'}</div>
            <div className="space-y-1 mt-1">
              {filteredLinks.map((item) => {
                const IconComponent = item.icon;
                return (
                  <button key={item.path} onClick={() => handleSelect(item.path)} className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/[0.06] text-left text-xs transition-colors group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[#0B1628] border border-white/10 flex items-center justify-center text-cyan-400 group-hover:border-cyan-400/40 shrink-0"><IconComponent className="w-3.5 h-3.5" /></div>
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-200 group-hover:text-cyan-300 truncate">{item.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] text-slate-400 ml-2">{item.category}</span>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition-transform group-hover:translate-x-1 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-3 bg-[#0B1628]/80 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2"><span>Ctrl/Cmd + K</span><span>•</span><span>{isEnglish ? 'ESC to close' : 'ESC para fechar'}</span></div>
          <span>BrisaBase Global Search</span>
        </div>
      </div>
    </div>
  );
};
