import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { User, Settings, Sliders, LogOut, ChevronDown, ShieldCheck } from 'lucide-react';

export const UserMenu: React.FC = () => {
  const { currentUser, showToast, language, logout, runtimeMode } = useApp();
  const isEnglish = language === 'en-US';
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
    showToast(
      isEnglish ? 'Signed out' : 'Sessão encerrada',
      runtimeMode === 'real'
        ? (isEnglish ? 'Real local admin session revoked.' : 'Sessão administrativa real revogada.')
        : (isEnglish ? 'Mock session removed from this browser.' : 'Sessão simulada removida do navegador.'),
      'info'
    );
    navigate('/login');
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isEnglish ? 'Account menu' : 'Menu da conta'}
        aria-expanded={isOpen}
        className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-white/[0.06] transition-all border border-transparent hover:border-white/10 group text-left"
      >
        <div className="relative">
          <img
            src={currentUser.avatar}
            alt={currentUser.name}
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-lg object-cover ring-1 ring-white/20 group-hover:ring-cyan-400 transition-all"
          />
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#020617]" />
        </div>

        <div className="hidden lg:flex flex-col">
          <span className="text-xs font-bold text-slate-100 group-hover:text-cyan-300 transition-colors leading-tight">
            {currentUser.name}
          </span>
          <span className="text-[10px] text-slate-400 leading-tight">
            {currentUser.role === 'Admin' ? (isEnglish ? 'Administrator' : 'Administrador') : currentUser.role}
          </span>
        </div>

        <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-transform hidden sm:block" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-[#07111F] border border-white/15 shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 backdrop-blur-xl">
          {/* User Info Header */}
          <div className="p-3 border-b border-white/[0.08] mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-100">{currentUser.name}</span>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5" />
                ADMIN
              </span>
            </div>
            <div className="text-[11px] text-slate-400 truncate mt-0.5">{currentUser.email}</div>
          </div>

          {/* Menu Items */}
          <div className="space-y-0.5">
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/settings');
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors text-left"
            >
              <User className="w-4 h-4 text-cyan-400" />
              <span>{isEnglish ? 'My profile' : 'Meu perfil'}</span>
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/settings');
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors text-left"
            >
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>{isEnglish ? 'Preferences' : 'Preferências'}</span>
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/settings');
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors text-left"
            >
              <Settings className="w-4 h-4 text-amber-400" />
              <span>{isEnglish ? 'Settings' : 'Configurações'}</span>
            </button>
          </div>

          <div className="pt-1 mt-1 border-t border-white/[0.08]">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors text-left font-semibold"
            >
              <LogOut className="w-4 h-4" />
              <span>{isEnglish ? 'Sign out' : 'Sair'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
