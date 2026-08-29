import React, { useState } from 'react';
import { useLocation, useNavigate } from '../../routing';
import { useApp } from '../../../context/AppContext';
import { adminAuthService } from '../../services/adminAuthService';
import { Environment } from '../../types';
import {
  Search,
  Bell,
  BookOpen,
  ChevronDown,
  Layers,
  Globe,
  Menu,
  User,
  LogOut,
  Plus,
  Check
} from 'lucide-react';

interface HeaderProps {
  onOpenNotifications: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenNotifications }) => {
  const {
    projects,
    currentProject,
    environment,
    notifications,
    selectProject,
    setEnvironment,
    setGlobalSearchOpen,
    setMobileSidebarOpen
  } = useApp();

  const location = useLocation();
  const navigate = useNavigate();

  const [isProjMenuOpen, setIsProjMenuOpen] = useState(false);
  const [isEnvMenuOpen, setIsEnvMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Generate Breadcrumbs
  const pathParts = location.pathname.split('/').filter(Boolean);
  const getBreadcrumb = () => {
    if (pathParts.length === 0) return 'Dashboard';
    const mainSection = pathParts[0];
    if (mainSection === 'projects') return 'Projetos';
    if (mainSection === 'team') return 'Equipe';
    if (mainSection === 'billing') return 'Planos e Cobrança';
    if (mainSection === 'settings') return 'Configurações';
    if (mainSection === 'docs') return 'Documentação';

    // Routes under /projects/:id/...
    if (pathParts.length >= 3) {
      const section = pathParts[2];
      const sectionMap: Record<string, string> = {
        database: 'Banco de Dados',
        auth: 'Autenticação',
        storage: 'Storage',
        realtime: 'Realtime',
        apis: 'APIs',
        logs: 'Logs',
        monitoring: 'Monitoramento'
      };
      return sectionMap[section] || section;
    }
    return 'Visão Geral';
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-white/[0.08] bg-[#0b0c14]/80 px-4 md:px-8 backdrop-blur-xl">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 text-sm font-sans">
          <span className="bb-gradient-text font-semibold">BrisaBase</span>
          <span className="text-slate-700">/</span>
          <span className="text-slate-500 truncate max-w-[120px] sm:max-w-[180px]">
            {currentProject ? currentProject.name : 'Meu App'}
          </span>
          <span className="text-slate-700 hidden sm:inline">/</span>
          <span className="text-white font-medium hidden sm:inline">{getBreadcrumb()}</span>
        </div>
      </div>

      {/* Right: Project Selector, Environment, Search, Actions */}
      <div className="flex items-center gap-3">
        {/* Search Input trigger */}
        <div className="relative hidden sm:block">
          <input
            type="text"
            readOnly
            onClick={() => setGlobalSearchOpen(true)}
            placeholder="Buscar projetos, serviços e logs..."
            className="bg-white/[0.035] border border-white/[0.1] text-xs text-slate-300 placeholder-slate-500 px-3 py-2 rounded-xl w-48 md:w-72 cursor-pointer focus:outline-none focus:ring-1 focus:ring-fuchsia-400"
          />
        </div>

        {/* Project Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setIsProjMenuOpen(!isProjMenuOpen);
              setIsEnvMenuOpen(false);
              setIsUserMenuOpen(false);
            }}
            className="flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.075] transition-all"
          >
            <Layers className="h-3.5 w-3.5 text-purple-400" />
            <span className="truncate max-w-[90px] sm:max-w-[120px]">
              {currentProject ? currentProject.name : 'Selecionar'}
            </span>
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </button>

          {isProjMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-800 bg-[#0F172A] p-1.5 shadow-2xl z-50">
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Seus Projetos
              </div>
              <div className="max-h-52 overflow-y-auto space-y-0.5">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      selectProject(p.id);
                      setIsProjMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      currentProject?.id === p.id
                        ? 'bg-purple-600/20 text-white border border-purple-500/30'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    {currentProject?.id === p.id && <Check className="h-3.5 w-3.5 text-purple-400" />}
                  </button>
                ))}
              </div>
              <div className="mt-1 border-t border-slate-800 pt-1">
                <button
                  onClick={() => {
                    setIsProjMenuOpen(false);
                    navigate('/projects');
                  }}
                  className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-purple-400 hover:bg-purple-950/40 font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Gerenciar Projetos
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Environment Selector Dropdown */}
        <div className="relative hidden md:block">
          <button
            onClick={() => {
              setIsEnvMenuOpen(!isEnvMenuOpen);
              setIsProjMenuOpen(false);
              setIsUserMenuOpen(false);
            }}
            className="flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.035] px-2.5 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.075] transition-all"
          >
            <Globe className="h-3.5 w-3.5 text-cyan-400" />
            <span className="capitalize">{environment}</span>
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </button>

          {isEnvMenuOpen && (
            <div className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-800 bg-[#0F172A] p-1.5 shadow-2xl z-50">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Ambientes
              </div>
              {(['production', 'staging', 'development'] as Environment[]).map((env) => (
                <button
                  key={env}
                  onClick={() => {
                    setEnvironment(env);
                    setIsEnvMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                    environment === env
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>{env}</span>
                  {environment === env && <Check className="h-3.5 w-3.5 text-cyan-400" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <button
          onClick={onOpenNotifications}
          className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-transparent hover:border-white/[0.1] hover:bg-white/[0.05] text-slate-400 transition-colors"
          title="Notificações"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-2 w-2 rounded-full bg-purple-500"></span>
          )}
        </button>

        {/* Primary Action Button */}
        <button
          onClick={() => navigate('/projects')}
          className="bb-primary-action text-white text-xs px-4 py-2 rounded-xl font-semibold transition-all flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Novo Projeto</span>
        </button>

        {/* User Menu with Logout */}
        <div className="relative">
          <button
            onClick={() => {
              setIsUserMenuOpen(!isUserMenuOpen);
              setIsProjMenuOpen(false);
              setIsEnvMenuOpen(false);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.035] text-slate-300 hover:bg-white/[0.075] transition-colors"
            title="Account"
          >
            <User className="h-4 w-4" />
          </button>
          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-800 bg-[#0F172A] p-1.5 shadow-2xl z-50">
              <div className="px-2.5 py-2 border-b border-slate-800 mb-1">
                <div className="text-xs font-medium text-white truncate">
                  {adminAuthService.getUser()?.name || adminAuthService.getUser()?.email || 'Admin'}
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {adminAuthService.getUser()?.email || ''}
                </div>
              </div>
              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  void adminAuthService.logout().then(() => navigate('/login', { replace: true }));
                }}
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-red-400 hover:bg-red-950/40 font-medium"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
