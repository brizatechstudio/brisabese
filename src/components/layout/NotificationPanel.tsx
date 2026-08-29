import React, { useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  CheckCheck,
  X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({ isOpen, onClose }) => {
  const { notifications, unreadNotificationsCount, markAllNotificationsRead, language } = useApp();
  const isEnglish = language === 'en-US';
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-3 w-80 sm:w-96 rounded-2xl bg-[#07111F] border border-white/15 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl"
    >
      {/* Header */}
      <div className="p-4 border-b border-white/[0.08] bg-[#0B1628] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-slate-100">{isEnglish ? 'Notifications' : 'Notificações'}</h3>
          {unreadNotificationsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-[#1677FF] text-white text-[10px] font-bold">
              {unreadNotificationsCount} {isEnglish ? 'new' : 'novas'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {unreadNotificationsCount > 0 && (
            <button
              onClick={markAllNotificationsRead}
              title={isEnglish ? 'Mark all as read' : 'Marcar todas como lidas'}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 hover:underline font-medium"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>{isEnglish ? 'Mark all' : 'Ler todas'}</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="max-h-96 overflow-y-auto divide-y divide-white/[0.04]">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            {isEnglish ? 'No notifications right now.' : 'Nenhuma notificação no momento.'}
          </div>
        ) : (
          notifications.map((n) => {
            const iconMap = {
              success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
              warning: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
              info: <Info className="w-4 h-4 text-cyan-400 shrink-0" />,
              error: <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            }[n.type];

            return (
              <div
                key={n.id}
                className={`p-3.5 transition-colors flex items-start gap-3 ${
                  !n.read ? 'bg-[#1677FF]/[0.06]' : 'hover:bg-white/[0.03]'
                }`}
              >
                <div className="mt-0.5">{iconMap}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className={`text-xs font-semibold ${!n.read ? 'text-slate-100' : 'text-slate-300'}`}>
                      {n.title}
                    </h4>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{n.message}</p>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-1.5">
                    <Clock className="w-3 h-3" />
                    <span>{n.timeAgo}</span>
                    <span>•</span>
                    <span className="uppercase text-[9px] font-mono text-cyan-400/80">{n.service}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="p-3 bg-[#0B1628]/60 border-t border-white/[0.08] text-center">
        <button
          onClick={() => {
            onClose();
            navigate('/logs');
          }}
          className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
        >
          {isEnglish ? 'View all system logs and events →' : 'Ver todos os logs e eventos do sistema →'}
        </button>
      </div>
    </div>
  );
};
