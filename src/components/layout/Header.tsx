import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Search,
  Bell,
  HelpCircle,
  Menu
} from 'lucide-react';
import { UserMenu } from './UserMenu';
import { NotificationPanel } from './NotificationPanel';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  onToggleMobileMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileMenu }) => {
  const {
    language,
    unreadNotificationsCount,
    setIsSearchOpen,
    activeProject
  } = useApp();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 h-16 w-full max-w-full min-w-0 bg-[#07111F]/90 backdrop-blur-xl border-b border-white/[0.08] px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
      {/* Left Section: Mobile Menu + Search Bar */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 max-w-xl">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            aria-label={language === 'en-US' ? 'Open navigation menu' : 'Abrir menu de navegação'}
            className="lg:hidden shrink-0 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06]"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* Global Search Bar Button */}
        <button
          onClick={() => setIsSearchOpen(true)}
          className="min-w-0 flex-1 max-w-md flex items-center justify-between gap-2 px-3 sm:px-3.5 py-2 rounded-xl bg-[#0B1628] hover:bg-[#112240] border border-white/[0.08] hover:border-cyan-400/40 text-slate-400 hover:text-slate-200 transition-all text-xs group"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <Search className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-cyan-400 transition-colors" />
            <span className="min-w-0 flex-1 truncate text-left">{language === 'en-US' ? 'Search projects, tables, users...' : 'Buscar projetos, tabelas, usuários...'}</span>
          </div>
          <div className="hidden sm:flex shrink-0 items-center gap-1 font-mono text-[10px] bg-white/[0.08] px-1.5 py-0.5 rounded text-slate-400 group-hover:text-slate-200">
            <span>Ctrl</span>
            <span>+</span>
            <span>K</span>
          </div>
        </button>
      </div>

      {/* Right Controls */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-3">
        {/* Project Status Pill (visible on wide desktop) */}
        {activeProject && (
          <div className="hidden xl:flex min-w-0 items-center gap-2 px-3 py-1 rounded-full bg-[#0B1628] border border-white/[0.08] text-xs">
            <span className="w-2 h-2 shrink-0 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300 font-medium truncate max-w-[120px]">
              {activeProject.name}
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-cyan-400 font-mono text-[11px]">{activeProject.region.split(' ')[0]}</span>
          </div>
        )}

        {/* Help / Docs */}
        <button
          onClick={() => navigate('/docs')}
          title={language === 'en-US' ? 'Documentation and Guides' : 'Documentação e Guias'}
          aria-label={language === 'en-US' ? 'Documentation and Guides' : 'Documentação e Guias'}
          className="hidden sm:inline-flex p-2 rounded-xl text-slate-400 hover:text-cyan-400 hover:bg-white/[0.06] transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* Notifications Icon with Popover */}
        <div className="relative shrink-0">
          <button
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            title={language === 'en-US' ? 'System notifications' : 'Notificações do Sistema'}
            aria-label={language === 'en-US' ? 'System notifications' : 'Notificações do Sistema'}
            className="p-2 rounded-xl text-slate-400 hover:text-cyan-400 hover:bg-white/[0.06] transition-colors relative"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#1677FF] text-white text-[9px] font-bold flex items-center justify-center shadow-md shadow-[#1677FF]/50">
                {unreadNotificationsCount}
              </span>
            )}
          </button>

          <NotificationPanel isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} />
        </div>

        <div className="h-6 w-px bg-white/[0.08] mx-1 hidden sm:block" />

        {/* User Profile Menu */}
        <UserMenu />
      </div>
    </header>
  );
};
