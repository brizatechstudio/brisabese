import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Environment, Project } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';
import {
  FolderKanban,
  Plus,
  Globe,
  Database,
  Users,
  HardDrive,
  Check,
  Trash2,
  ExternalLink,
  X
} from 'lucide-react';

export const ProjectsPage: React.FC = () => {
  const { projects, currentProject, selectProject, createProject, deleteProject } = useApp();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [region, setRegion] = useState('us-east-1 (N. Virginia)');
  const [environment, setEnvironment] = useState<Environment>('production');

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    await createProject({ name, description, region, environment });
    setIsModalOpen(false);
    setName('');
    setDescription('');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-purple-400" />
            Gestão de Projetos BrisaBase
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Gerencie suas instâncias de banco de dados, chaves API, autenticação e microsserviços por ambiente.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-purple-500 shadow-lg shadow-purple-900/40 transition-all"
        >
          <Plus className="w-4 h-4" />
          Novo Projeto
        </button>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {projects.map((proj) => {
          const isSelected = currentProject?.id === proj.id;

          return (
            <div
              key={proj.id}
              className={`relative flex flex-col justify-between rounded-2xl border p-5 shadow-xl transition-all duration-200 ${
                isSelected
                  ? 'border-purple-500 bg-slate-900/90 ring-1 ring-purple-500/50 shadow-purple-950/30'
                  : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900/80'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/30 font-mono">
                    {proj.environment}
                  </span>
                  <StatusBadge status={proj.status} />
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    {proj.name}
                    {isSelected && <Check className="w-4 h-4 text-purple-400" />}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{proj.description}</p>
                </div>

                <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs font-mono text-slate-400">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 uppercase font-sans font-semibold block">Região</span>
                    <span className="truncate block text-slate-300">{proj.region}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 uppercase font-sans font-semibold block">Uptime</span>
                    <span className="text-emerald-400 font-bold">{proj.uptime}%</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 uppercase font-sans font-semibold block">Usuários</span>
                    <span className="text-slate-200">{(proj.usersCount ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 uppercase font-sans font-semibold block">Storage</span>
                    <span className="text-slate-200">{Math.round(proj.storageUsedMb / 1024)} GB</span>
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <button
                  onClick={() => selectProject(proj.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-purple-600/30 text-white border border-purple-500/30'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {isSelected ? 'Projeto Ativo' : 'Acessar Projeto'}
                </button>

                {projects.length > 1 && (
                  <button
                    onClick={() => deleteProject(proj.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
                    title="Excluir Projeto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-semibold text-slate-100">Criar Novo Projeto</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Nome do Projeto</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: App de Delivery S/A"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Descrição</label>
                <input
                  type="text"
                  placeholder="Ex: Backend principal para API de pedidos e notificações"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Região de Deploy</label>
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-purple-500 focus:outline-none"
                  >
                    <option value="us-east-1 (N. Virginia)">us-east-1 (N. Virginia)</option>
                    <option value="sa-east-1 (São Paulo)">sa-east-1 (São Paulo)</option>
                    <option value="us-west-2 (Oregon)">us-west-2 (Oregon)</option>
                    <option value="eu-central-1 (Frankfurt)">eu-central-1 (Frankfurt)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Ambiente Inicial</label>
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-purple-500 focus:outline-none"
                  >
                    <option value="production">Produção</option>
                    <option value="staging">Staging</option>
                    <option value="development">Desenvolvimento</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 shadow-md shadow-purple-900/30"
                >
                  Criar Projeto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
