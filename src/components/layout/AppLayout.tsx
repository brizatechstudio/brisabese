import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { GlobalSearch } from './GlobalSearch';
import { ToastContainer } from '../ui/ToastContainer';
import { useApp } from '../../context/AppContext';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { mockApi } from '../../services/mockApi';
import { X, FolderPlus } from 'lucide-react';
import { BrisaLogo } from '../BrisaLogo';

export const AppLayout: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { sidebarCollapsed, refreshProjects, setActiveProject, showToast, language, authReady, isAuthenticated, runtimeError, runtimeMode } = useApp();
  const isEnglish = language === 'en-US';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);

  // New Project Form State
  const [projName, setProjName] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projRegion, setProjRegion] = useState('sa-east-1 (São Paulo)');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const openNewProject = () => setIsNewProjectModalOpen(true);
    window.addEventListener('brisabase:new-project', openNewProject);
    return () => window.removeEventListener('brisabase:new-project', openNewProject);
  }, []);

  if (!authReady) {
    return <div className="min-h-screen bg-[#020617] text-slate-300 grid place-items-center text-sm">{isEnglish ? 'Validating BrisaBase session…' : 'Validando sessão BrisaBase…'}</div>;
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName.trim()) return;

    try {
      setIsCreating(true);
      const newProj = await mockApi.createProject({
        name: projName,
        description: projDesc || 'Novo projeto criado no BrisaBase',
        region: projRegion,
        iconColor: ['#12D9FF', '#1677FF', '#7C3AED', '#10B981', '#F59E0B'][
          Math.floor(Math.random() * 5)
        ]
      });
      await refreshProjects();
      setActiveProject(newProj);
      showToast('Projeto Criado!', `O projeto ${newProj.name} está pronto para uso`, 'success');
      setIsNewProjectModalOpen(false);
      setProjName('');
      setProjDesc('');
    } catch (err) {
      showToast('Erro ao criar', 'Não foi possível criar o projeto', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen w-full max-w-full min-w-0 bg-[#020617] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
      {/* Desktop & Tablet Persistent Sidebar */}
      <div className="hidden lg:block">
        <Sidebar onOpenNewProject={() => setIsNewProjectModalOpen(true)} />
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex max-w-full overflow-hidden">
          <div
            className="fixed inset-0 bg-[#020617]/80 backdrop-blur-md"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-[min(18rem,calc(100vw-2rem))] max-w-full bg-[#07111F] border-r border-white/10 flex flex-col h-full animate-in slide-in-from-left">
            <div className="p-4 flex items-center justify-between border-b border-white/10">
              <BrisaLogo size="sm" showSlogan />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="text-slate-400 p-1.5 rounded-lg hover:bg-white/[0.06]"
                aria-label={isEnglish ? 'Close navigation menu' : 'Fechar menu de navegação'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden" onClick={() => setMobileMenuOpen(false)}>
              <Sidebar onOpenNewProject={() => setIsNewProjectModalOpen(true)} />
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col w-full max-w-full min-w-0 transition-all duration-300 ${
          sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        <Header onToggleMobileMenu={() => setMobileMenuOpen(true)} />

        <main className="flex-1 min-w-0 w-full max-w-full p-3 sm:p-4 lg:p-5 mx-auto">
          {runtimeError && (
            <div className="mb-4 max-w-full break-words rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
              <strong>{runtimeMode === 'real' ? 'Runtime real:' : 'Mock:'}</strong> {runtimeError}
            </div>
          )}
          <div className="min-w-0 max-w-full">{children ?? <Outlet />}</div>
        </main>
      </div>

      {/* Global Modals, Toast, Search */}
      <GlobalSearch />
      <ToastContainer />

      {/* Modal Criar Novo Projeto */}
      <Modal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        title={isEnglish ? 'Create New Project' : 'Criar Novo Projeto'}
        subtitle={isEnglish ? 'Configure a new environment with database, auth, storage and serverless.' : 'Configure um novo ambiente com banco de dados, auth, storage e serverless.'}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsNewProjectModalOpen(false)}
              disabled={isCreating}
            >
              {isEnglish ? 'Cancel' : 'Cancelar'}
            </Button>
            <Button
              variant="gradient"
              size="sm"
              onClick={handleCreateProject}
              isLoading={isCreating}
              disabled={!projName.trim()}
              leftIcon={<FolderPlus className="w-4 h-4" />}
            >
              {isEnglish ? 'Create Project' : 'Criar Projeto'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateProject} className="space-y-4 min-w-0">
          <Input
            label={isEnglish ? 'Project Name' : 'Nome do Projeto'}
            placeholder={isEnglish ? 'e.g. BrisaStore Mobile, FoodExpress Web' : 'ex: BrisaStore Mobile, FoodExpress Web'}
            value={projName}
            onChange={(e) => setProjName(e.target.value)}
            required
            autoFocus
          />

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isEnglish ? 'Description (Optional)' : 'Descrição (Opcional)'}
            </label>
            <textarea
              className="w-full max-w-full rounded-xl bg-[#07111F] border border-white/10 text-slate-100 placeholder:text-slate-500 text-sm p-3 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 resize-none h-20"
              placeholder={isEnglish ? 'Describe the purpose of this project or service...' : 'Descreva o propósito deste projeto ou serviço...'}
              value={projDesc}
              onChange={(e) => setProjDesc(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isEnglish ? 'Project Region' : 'Região do Projeto'}
            </label>
            <div className="relative min-w-0">
              <select
                value={projRegion}
                onChange={(e) => setProjRegion(e.target.value)}
                className="w-full max-w-full rounded-xl bg-[#07111F] border border-white/10 text-slate-100 text-sm px-3 py-2.5 appearance-none focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
              >
                <option value="sa-east-1 (São Paulo)">🇧🇷 {isEnglish ? 'South America (São Paulo - sa-east-1)' : 'América do Sul (São Paulo - sa-east-1)'}</option>
                <option value="us-east-1 (N. Virginia)">🇺🇸 {isEnglish ? 'US East (N. Virginia - us-east-1)' : 'EUA Leste (N. Virginia - us-east-1)'}</option>
                <option value="eu-central-1 (Frankfurt)">🇩🇪 {isEnglish ? 'Europe (Frankfurt - eu-central-1)' : 'Europa (Frankfurt - eu-central-1)'}</option>
                <option value="ap-southeast-1 (Singapore)">🇸🇬 {isEnglish ? 'Asia (Singapore - ap-southeast-1)' : 'Ásia (Singapura - ap-southeast-1)'}</option>
              </select>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 break-words">
              {isEnglish ? 'The region is project metadata in the current runtime; managed multi-region provisioning is not enabled yet.' : 'A região é um metadado do projeto no runtime atual; o provisionamento gerenciado multi-região ainda não está habilitado.'}
            </p>
          </div>
        </form>
      </Modal>
    </div>
  );
};
