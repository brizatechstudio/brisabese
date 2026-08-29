import React from 'react';
import { NavLink, useLocation } from '../../routing';
import { useApp } from '../../../context/AppContext';
import { BrisaBaseLogo } from '../common/BrisaBaseLogo';
import {
  LayoutDashboard,
  FolderKanban,
  Database,
  Users,
  FolderOpen,
  Radio,
  Webhook,
  Activity,
  LineChart,
  UsersRound,
  CreditCard,
  Settings,
  X,
  BookOpen,
  ShieldCheck,
  Code2,
  Braces,
  GitBranch,
  Globe2,
  BellRing,
  HardDriveDownload
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { currentProject, isMobileSidebarOpen, setMobileSidebarOpen } = useApp();
  const location = useLocation();

  const projectId = currentProject?.id;
  const projectPath = (section: string) => projectId ? `/projects/${projectId}/${section}` : '/projects';

  const navSections = [
    {
      category: null,
      items: [
        { label: 'Visão Geral', icon: LayoutDashboard, path: '/dashboard' }
      ]
    },
    {
      category: 'PRINCIPAL',
      items: [
        { label: 'Projetos', icon: FolderKanban, path: '/projects' }
      ]
    },
    {
      category: 'DESENVOLVIMENTO',
      items: [
        { label: 'Banco de Dados', icon: Database, path: projectPath('database'), projectScoped: true },
        { label: 'Autenticação', icon: Users, path: projectPath('auth'), projectScoped: true },
        { label: 'Storage', icon: FolderOpen, path: projectPath('storage'), projectScoped: true },
        { label: 'Realtime', icon: Radio, path: projectPath('realtime'), projectScoped: true },
        { label: 'Functions', icon: Code2, path: projectPath('functions'), projectScoped: true },
        { label: 'GraphQL', icon: Braces, path: projectPath('graphql'), projectScoped: true },
        { label: 'Preview DB', icon: GitBranch, path: projectPath('previews'), projectScoped: true },
        { label: 'Hosting', icon: Globe2, path: projectPath('hosting'), projectScoped: true },
        { label: 'Messaging', icon: BellRing, path: projectPath('messaging'), projectScoped: true },
        { label: 'Backups', icon: HardDriveDownload, path: projectPath('backups'), projectScoped: true },
        { label: 'Security', icon: ShieldCheck, path: projectPath('security'), projectScoped: true },
        { label: 'APIs', icon: Webhook, path: projectPath('apis'), projectScoped: true }
      ]
    },
    {
      category: 'OBSERVABILIDADE',
      items: [
        { label: 'Logs', icon: Activity, path: projectPath('logs'), projectScoped: true },
        { label: 'Monitoramento', icon: LineChart, path: projectPath('monitoring'), projectScoped: true }
      ]
    },
    {
      category: 'ORGANIZAÇÃO',
      items: [
        { label: 'Equipe', icon: UsersRound, path: '/team' },
        { label: 'Planos e Cobrança', icon: CreditCard, path: '/billing' }
      ]
    },
    {
      category: 'CONFIGURAÇÕES',
      items: [
        { label: 'Configurações', icon: Settings, path: '/settings' },
        { label: 'Documentação', icon: BookOpen, path: '/docs' }
      ]
    }
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0b0c14]/95 border-r border-white/[0.08] w-64 select-none shadow-[18px_0_45px_-36px_rgba(0,0,0,0.95)]">
      <div className="p-6 pb-7 flex items-center justify-between border-b border-white/[0.06]">
        <NavLink to="/dashboard" onClick={() => setMobileSidebarOpen(false)}>
          <BrisaBaseLogo size="md" />
        </NavLink>
        <button onClick={() => setMobileSidebarOpen(false)} className="lg:hidden p-1 text-slate-400 hover:text-slate-100 rounded-lg">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-5 overflow-y-auto">
        {navSections.map((sec, idx) => (
          <div key={idx} className="space-y-1">
            {sec.category && <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.16em] px-3">{sec.category}</p>}
            {sec.items.map((item) => {
              const Icon = item.icon;
              const isProjectScoped = 'projectScoped' in item && item.projectScoped === true;
              const isActive = isProjectScoped
                ? Boolean(projectId) && location.pathname.startsWith(item.path)
                : location.pathname.startsWith(item.path);

              return (
                <NavLink
                  key={`${sec.category || 'root'}-${item.label}`}
                  to={item.path}
                  onClick={() => setMobileSidebarOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${isActive ? 'bb-primary-action text-white font-semibold shadow-lg' : 'text-[#aaa6b8] hover:bg-white/[0.055] hover:text-white'}`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-white/[0.07]">
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.025] border border-white/[0.05]">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 via-rose-500 to-violet-600 flex items-center justify-center text-xs font-semibold text-white border border-white/20">LS</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">Lucas Silva</p>
            <p className="text-[10px] text-slate-500 truncate">lucas@brisabase.dev</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0 h-screen sticky top-0 z-40">{sidebarContent}</aside>
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity" onClick={() => setMobileSidebarOpen(false)} />
          <div className="relative z-50 flex h-full w-64 max-w-xs flex-1 transform transition-transform duration-300">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};
