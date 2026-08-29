import React, { useMemo, useState } from 'react';
import {
  Activity,
  Database,
  Globe2,
  HardDrive,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UsersRound
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useApp } from '../context/AppContext';
import { mockApi } from '../services/mockApi';
import { Project } from '../types';

export const Projects: React.FC = () => {
  const { projects, activeProject, setActiveProject, refreshProjects, showToast } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'production' | 'development' | 'staging'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesQuery = !q || project.name.toLowerCase().includes(q) || project.slug.toLowerCase().includes(q) || project.region.toLowerCase().includes(q);
      const matchesFilter = filter === 'all' || project.category === filter;
      return matchesQuery && matchesFilter;
    });
  }, [projects, query, filter]);

  const removeProject = async (project: Project) => {
    if (projects.length <= 1) {
      showToast('Projeto protegido', 'Mantenha pelo menos um projeto no mock.', 'warning');
      return;
    }
    if (!window.confirm(`Remover o projeto simulado "${project.name}"?`)) return;
    setDeletingId(project.id);
    await mockApi.deleteProject(project.id);
    await refreshProjects();
    setDeletingId(null);
    showToast('Projeto removido', `${project.name} foi apagado apenas do localStorage.`, 'info');
  };

  const statusTone = (project: Project) => {
    if (project.status === 'active') return 'success' as const;
    if (project.status === 'maintenance') return 'warning' as const;
    if (project.status === 'paused') return 'danger' as const;
    return 'cyan' as const;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Projetos"
        subtitle="Gerencie os projetos simulados, regiões, ambientes e uso agregado antes do modelo multi-tenant real."
        badge={<Badge variant="cyan" dot>{projects.length} projetos mock</Badge>}
        actions={
          <Button
            variant="gradient"
            size="sm"
            onClick={() => window.dispatchEvent(new Event('brisabase:new-project'))}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Novo Projeto
          </Button>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          ['Projetos', String(projects.length), 'workspace local', Globe2],
          ['Usuários', '248.5K', 'somatório simulado', UsersRound],
          ['Database', '7.4 GB', 'todos os projetos', Database],
          ['Storage', '186.4 GB', 'todos os projetos', HardDrive]
        ].map(([label, value, helper, Icon]: any) => (
          <div key={label} className="rounded-2xl bg-[#07111F] border border-white/[0.08] p-4 shadow-xl">
            <Icon className="w-4 h-4 text-cyan-400" />
            <div className="mt-3 text-2xl font-bold text-slate-100">{value}</div>
            <div className="text-xs font-semibold text-slate-300 mt-1">{label}</div>
            <div className="text-[11px] text-slate-500 mt-1">{helper}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl overflow-hidden">
        <div className="p-4 border-b border-white/[0.07] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative w-full lg:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, slug ou região..."
              className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#020617] border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'production', 'development', 'staging'] as const).map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${filter === item ? 'bg-[#1677FF] text-white' : 'bg-[#0B1628] text-slate-400 hover:text-white'}`}
              >
                {item === 'all' ? 'Todos' : item === 'production' ? 'Produção' : item === 'development' ? 'Desenvolvimento' : 'Staging'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-3 p-4">
          {visible.map((project) => {
            const isActive = project.id === activeProject?.id;
            return (
              <div key={project.id} className={`rounded-2xl border p-4 transition-all ${isActive ? 'border-cyan-400/40 bg-cyan-500/[0.06]' : 'border-white/[0.07] bg-[#0B1628]/50 hover:border-white/15'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="w-10 h-10 rounded-xl grid place-items-center text-sm font-black text-white shrink-0" style={{ backgroundColor: project.iconColor }}>{project.name[0]}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-100 truncate">{project.name}</h3>
                        {isActive && <Badge variant="cyan" size="sm">Ativo</Badge>}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5">{project.slug}</div>
                    </div>
                  </div>
                  <button onClick={() => showToast('Ações do projeto', `Projeto ${project.name}: ativar, remover e demais ações permanecem simuladas nesta fase.`, 'info')} className="text-slate-500 hover:text-slate-300" aria-label={`Ações de ${project.name}`}><MoreHorizontal className="w-4 h-4" /></button>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed mt-4 min-h-10">{project.description}</p>

                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <div className="rounded-lg bg-[#020617]/70 p-2"><div className="text-xs font-bold text-slate-100">{project.usersCount}</div><div className="text-[10px] text-slate-500">users</div></div>
                  <div className="rounded-lg bg-[#020617]/70 p-2"><div className="text-xs font-bold text-slate-100">{project.databaseSize}</div><div className="text-[10px] text-slate-500">database</div></div>
                  <div className="rounded-lg bg-[#020617]/70 p-2"><div className="text-xs font-bold text-slate-100">{project.storageSize}</div><div className="text-[10px] text-slate-500">storage</div></div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                  <div className="flex items-center gap-1.5"><Activity className="w-3 h-3" />{project.lastActivity}</div>
                  <Badge variant={statusTone(project)} size="sm">{project.category}</Badge>
                </div>

                <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                  <Button variant={isActive ? 'secondary' : 'outline'} size="sm" disabled={isActive} onClick={() => setActiveProject(project)}>
                    {isActive ? 'Projeto atual' : 'Ativar projeto'}
                  </Button>
                  <button
                    onClick={() => removeProject(project)}
                    disabled={deletingId === project.id}
                    className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
                    title="Remover projeto mock"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {visible.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-500">Nenhum projeto encontrado com os filtros atuais.</div>
        )}
      </div>
    </div>
  );
};
