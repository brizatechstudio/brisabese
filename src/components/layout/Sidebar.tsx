import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { BrisaLogo } from '../BrisaLogo';
import { ProjectSelector } from './ProjectSelector';
import { isRealMode } from '../../services/runtime';
import {
  LayoutDashboard,
  Database,
  Users,
  HardDrive,
  Code2,
  Radio,
  Globe,
  BarChart3,
  Terminal,
  Settings,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Crown,
  ArrowUpRight,
  Layers3,
  ShieldCheck,
  GitBranch,
  Wrench,
  Globe2,
  BellRing,
  Gauge,
  FolderKanban,
  Flag,
  Smartphone,
  Sparkles,
  Building2,
  Braces,
  ArchiveRestore,
  Activity,
  Network,
  CreditCard,
  BookOpen
} from 'lucide-react';

interface SidebarProps {
  onOpenNewProject?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenNewProject }) => {
  const { sidebarCollapsed, setSidebarCollapsed, projects, setActiveProject, activeProject, language } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const isEnglish = language === 'en-US';
  const navSections = [
    {
      title: isEnglish ? 'OVERVIEW' : 'VISÃO GERAL',
      items: [
        { label: isEnglish ? 'Overview' : 'Visão Geral', path: '/', icon: LayoutDashboard },
        { label: isEnglish ? 'Projects' : 'Projetos', path: '/projects', icon: FolderKanban }
      ]
    },
    {
      title: 'CORE BaaS',
      items: [
        { label: isEnglish ? 'Database' : 'Banco de Dados', path: '/database', icon: Database },
        { label: isEnglish ? 'Authentication' : 'Autenticação', path: '/auth', icon: Users },
        { label: 'Storage', path: '/storage', icon: HardDrive },
        { label: isEnglish ? 'Functions' : 'Funções', path: '/functions', icon: Code2 },
        { label: 'Realtime', path: '/realtime', icon: Radio },
        { label: 'APIs', path: '/apis', icon: Globe },
        { label: 'GraphQL', path: '/graphql', icon: Braces }
      ]
    },
    {
      title: isEnglish ? 'PLATFORM' : 'PLATAFORMA',
      items: [
        ...(!isRealMode ? [{ label: 'Data Platform', path: '/data-platform', icon: Layers3 }] : []),
        { label: isEnglish ? 'Security' : 'Segurança', path: '/security', icon: ShieldCheck },
        { label: isEnglish ? 'Environments & Branches' : 'Ambientes & Branches', path: '/environments', icon: GitBranch },
        { label: 'Preview DB', path: '/previews', icon: GitBranch },
        { label: 'SDK, CLI & DevTools', path: '/developer-tools', icon: Wrench },
        { label: isRealMode ? 'Hosting' : 'Hosting & Edge', path: '/hosting', icon: Globe2 },
        { label: isRealMode ? 'Messaging' : 'Messaging & Flags', path: '/messaging', icon: BellRing },
        ...(!isRealMode ? [{ label: isEnglish ? 'Infrastructure Preview' : 'Preview de Infraestrutura', path: '/infrastructure', icon: Network }] : [])
      ]
    },
    {
      title: isEnglish ? 'ECOSYSTEM' : 'ECOSSISTEMA',
      items: [
        { label: isEnglish ? 'Experiments' : 'Experimentos', path: '/experiments', icon: Flag },
        { label: 'App Quality', path: '/app-quality', icon: Smartphone },
        { label: 'Search & AI', path: '/search-ai', icon: Sparkles },
        { label: 'Enterprise', path: '/enterprise', icon: Building2 }
      ]
    },
    {
      title: isEnglish ? 'OPERATIONS' : 'OPERAÇÃO',
      items: [
        { label: 'Analytics', path: '/analytics', icon: BarChart3 },
        { label: isEnglish ? 'Observability' : 'Observabilidade', path: '/observability', icon: Activity },
        { label: isEnglish ? 'Backups' : 'Backups', path: '/backups', icon: ArchiveRestore },
        { label: 'Logs', path: '/logs', icon: Terminal },
        ...(!isRealMode ? [{ label: isEnglish ? 'Usage & Quotas' : 'Uso & Quotas', path: '/usage', icon: Gauge }] : [])
      ]
    },
    {
      title: isEnglish ? 'SETTINGS' : 'CONFIGURAÇÕES',
      items: [
        { label: isEnglish ? 'Settings' : 'Configurações', path: '/settings', icon: Settings },
        { label: isEnglish ? 'Members' : 'Membros', path: '/members', icon: UserCheck },
        { label: isEnglish ? 'Billing' : 'Planos e Cobrança', path: '/billing', icon: CreditCard },
        { label: isEnglish ? 'Documentation' : 'Documentação', path: '/docs', icon: BookOpen }
      ]
    }
  ];

  const recentProjects = projects.filter((p) => p.id !== activeProject?.id).slice(0, 3);

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 z-40 bg-[#07111F] border-r border-white/[0.08] flex flex-col transition-all duration-300 ${
        sidebarCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className="h-16 px-4 flex items-center justify-between border-b border-white/[0.08] shrink-0 bg-[#07111F]">
        <NavLink to="/" className="flex items-center">
          <BrisaLogo size="sm" showText={!sidebarCollapsed} />
        </NavLink>
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
          title={sidebarCollapsed ? (isEnglish ? 'Expand sidebar' : 'Expandir Sidebar') : (isEnglish ? 'Collapse sidebar' : 'Recolher Sidebar')}
        >
          {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <div className="p-3 border-b border-white/[0.08] bg-[#07111F]">
        <ProjectSelector onOpenNewProjectModal={onOpenNewProject} collapsed={sidebarCollapsed} />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navSections.map((sec) => (
          <div key={sec.title} className="space-y-1">
            {!sidebarCollapsed && (
              <div className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                {sec.title}
              </div>
            )}
            {sec.items.map((item) => {
              const IconComponent = item.icon;
              const isPathActive = item.path === '/'
                ? location.pathname === '/'
                : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all group ${
                    isPathActive
                      ? 'bg-[#1677FF] text-white shadow-lg shadow-[#1677FF]/25 font-bold'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.05]'
                  } ${sidebarCollapsed ? 'justify-center px-0 h-10' : ''}`}
                >
                  <IconComponent
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isPathActive ? 'text-white' : 'text-slate-400 group-hover:text-cyan-400'
                    }`}
                  />
                  {!sidebarCollapsed && <span className="truncate flex-1">{item.label}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}

        {!sidebarCollapsed && recentProjects.length > 0 && (
          <div className="pt-2 border-t border-white/[0.06] space-y-1">
            <div className="px-3 flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
              <span>{isEnglish ? 'Recent Projects' : 'Projetos Recentes'}</span>
              <button onClick={() => navigate('/')} className="text-cyan-400 hover:underline flex items-center gap-0.5">
                <span>{isEnglish ? 'View all' : 'Ver todos'}</span>
                <ArrowUpRight className="w-2.5 h-2.5" />
              </button>
            </div>
            {recentProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => setActiveProject(p)}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors text-left"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.iconColor }} />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-white/[0.08] bg-[#0B1628]/40 shrink-0">
        {sidebarCollapsed ? (
          <button
            onClick={() => navigate('/billing')}
            title={isEnglish ? 'Pro Plan - Advanced Features' : 'Plano Pro - Recursos Avançados'}
            className="w-full h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 hover:bg-amber-500/20 transition-all"
          >
            <Crown className="w-4 h-4" />
          </button>
        ) : (
          <div className="p-3 rounded-xl bg-gradient-to-b from-[#0B1628] to-[#112240] border border-amber-500/20 relative overflow-hidden shadow-inner">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1 rounded-lg bg-amber-500/20 text-amber-400"><Crown className="w-3.5 h-3.5" /></div>
              <div className="text-xs font-bold text-slate-100">{isEnglish ? 'Pro Plan' : 'Plano Pro'}</div>
            </div>
            <p className="text-[11px] text-slate-400 mb-2.5 leading-tight">{isEnglish ? 'Plan controls and usage information.' : 'Controles de plano e informações de uso.'}</p>
            <button
              onClick={() => navigate('/billing')}
              className="w-full py-1.5 px-3 rounded-lg bg-[#1677FF] hover:bg-[#1677FF]/90 text-white text-xs font-bold transition-all shadow-md shadow-[#1677FF]/30"
            >
              {isEnglish ? 'Manage Plan' : 'Gerenciar Plano'}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
