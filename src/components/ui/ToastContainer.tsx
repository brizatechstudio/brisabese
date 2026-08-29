import React from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((toast) => {
        const iconConfig = {
          success: { icon: CheckCircle2, color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-950/40' },
          info: { icon: Info, color: 'text-cyan-400', border: 'border-cyan-500/30', bg: 'bg-cyan-950/40' },
          warning: { icon: AlertTriangle, color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-950/40' },
          error: { icon: AlertCircle, color: 'text-rose-400', border: 'border-rose-500/30', bg: 'bg-rose-950/40' }
        }[toast.type];

        const IconComponent = iconConfig.icon;

        return (
          <div
            key={toast.id}
            id={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border backdrop-blur-xl shadow-2xl bg-[#07111F]/95 text-slate-100 ${iconConfig.border} transition-all duration-200 animate-in fade-in slide-in-from-bottom-3`}
          >
            <div className={`p-1.5 rounded-lg ${iconConfig.bg} ${iconConfig.color} shrink-0 mt-0.5`}>
              <IconComponent className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-slate-100">{toast.title}</h4>
              {toast.description && (
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{toast.description}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-500 hover:text-slate-300 p-1 rounded-md transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
