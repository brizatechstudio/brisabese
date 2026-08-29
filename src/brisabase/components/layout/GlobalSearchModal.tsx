import React, { useState } from 'react';
import { useNavigate } from '../../routing';
import { useApp } from '../../../context/AppContext';
import {
  Search,
  FolderKanban,
  Database,
  Activity,
  Settings,
  UsersRound,
  BookOpen,
  X,
  ChevronRight
} from 'lucide-react';

export const GlobalSearchModal: React.FC = () => {
  const { isGlobalSearchOpen, setGlobalSearchOpen, projects, currentProject } = useApp();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  if (!isGlobalSearchOpen) return null;

  const projectId = currentProject?.id || 'proj_ecommerce_1';

  const searchableItems = [
    // Projects
    ...projects.map((p) => ({
      category: 'Projetos',
      title: p.name,
      description: `Ambiente: ${p.environment} • Região: ${p.region}`,
      icon: FolderKanban,
      path: `/projects`
    })),
    // Database Tables
    { category: 'Banco de Dados', title: 'Tabelas', description: 'Visualizar e gerenciar tabelas do banco de dados', icon: Database, path: `/projects/${projectId}/database` },
    { category: 'Banco de Dados', title: 'SQL Editor', description: 'Executar queries e visualizar histórico', icon: Database, path: `/projects/${projectId}/database` },
    // Observability & Settings
    { category: 'Observabilidade', title: 'Logs de Sistema', description: 'Visualizador de logs em tempo real', icon: Activity, path: `/projects/${projectId}/logs` },
    { category: 'Observabilidade', title: 'Monitoramento & Métricas', description: 'Métricas de CPU, memória e latência', icon: Activity, path: `/projects/${projectId}/monitoring` },
    { category: 'Organização', title: 'Gestão de Equipe', description: 'Membros, funções e permissões', icon: UsersRound, path: `/team` },
    { category: 'Configurações', title: 'Chaves de API & Webhooks', description: 'Gestão de chaves públicas e secretas', icon: Settings, path: `/projects/${projectId}/apis` },
    { category: 'Documentação', title: 'Documentação BrisaBase SDK', description: 'Guia completo de integração TypeScript/CLI', icon: BookOpen, path: `/docs` }
  ];

  const filtered = query.trim()
    ? searchableItems.filter(
        (i) =>
          i.title.toLowerCase().includes(query.toLowerCase()) ||
          i.category.toLowerCase().includes(query.toLowerCase()) ||
          i.description.toLowerCase().includes(query.toLowerCase())
      )
    : searchableItems;

  const handleSelect = (path: string) => {
    setGlobalSearchOpen(false);
    setQuery('');
    navigate(path);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity"
        onClick={() => setGlobalSearchOpen(false)}
      />

      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/95 shadow-2xl overflow-hidden backdrop-blur-2xl z-50">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3.5">
          <Search className="h-5 w-5 text-purple-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por projetos, tabelas, logs e configurações..."
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-medium"
            autoFocus
          />
          <button
            onClick={() => setGlobalSearchOpen(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              Nenhum resultado encontrado para "{query}".
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={idx}
                  onClick={() => handleSelect(item.path)}
                  className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition-all hover:bg-purple-950/30 hover:border-purple-500/20 border border-transparent"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-purple-400 shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-200 truncate">{item.title}</span>
                        <span className="text-[10px] font-medium text-purple-400 bg-purple-950/50 px-1.5 py-0.5 rounded border border-purple-800/30 shrink-0">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.description}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-600 shrink-0 ml-2" />
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts info */}
        <div className="flex items-center justify-between border-t border-slate-800/80 bg-slate-950/60 px-4 py-2.5 text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <kbd className="rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-[10px] font-mono text-slate-300">
              ESC
            </kbd>
            <span>para fechar</span>
          </div>
          <span className="font-medium text-slate-400">BrisaBase Command Palette</span>
        </div>
      </div>
    </div>
  );
};
