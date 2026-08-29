import React from 'react';
import { useApp } from '../../../context/AppContext';
import { X, CheckCheck, Bell, CheckCircle2, AlertTriangle, Info, AlertCircle } from 'lucide-react';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({ isOpen, onClose }) => {
  const { notifications, markNotificationAsRead, markAllNotificationsAsRead } = useApp();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-md bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-purple-400" />
              <h2 className="text-base font-semibold text-slate-100">Notificações do Sistema</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={markAllNotificationsAsRead}
                className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors p-1 rounded"
                title="Marcar todas como lidas"
              >
                <CheckCheck className="w-4 h-4" />
                <span className="hidden sm:inline">Marcar todas</span>
              </button>
              <button
                onClick={onClose}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {notifications.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                Nenhuma notificaçāo no momento.
              </div>
            ) : (
              notifications.map((notif) => {
                const isSuccess = notif.type === 'success';
                const isWarning = notif.type === 'warning';
                const isError = notif.type === 'error';

                return (
                  <div
                    key={notif.id}
                    onClick={() => markNotificationAsRead(notif.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      notif.read
                        ? 'bg-slate-900/30 border-slate-800/80 text-slate-400'
                        : 'bg-slate-900/80 border-purple-500/30 text-slate-200 shadow-lg'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        {isSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                        {isWarning && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                        {isError && <AlertCircle className="w-4 h-4 text-rose-400" />}
                        {!isSuccess && !isWarning && !isError && <Info className="w-4 h-4 text-purple-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-semibold text-slate-100 truncate">{notif.title}</h4>
                          <span className="text-[10px] text-slate-500 shrink-0">{notif.timestamp}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{notif.message}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
