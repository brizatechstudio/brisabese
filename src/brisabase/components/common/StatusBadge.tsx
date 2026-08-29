import React from 'react';

interface StatusBadgeProps {
  status: number | string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const code = typeof status === 'number' ? status : parseInt(status, 10);

  if (!isNaN(code)) {
    if (code >= 200 && code < 300) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          {code}
        </span>
      );
    }
    if (code >= 400 && code < 500) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
          {code}
        </span>
      );
    }
    if (code >= 500) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20">
          {code}
        </span>
      );
    }
  }

  // String status like "online", "active", "pending", "failed"
  const str = String(status).toLowerCase();

  if (['online', 'active', 'completed', 'success', 'paid'].includes(str)) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
        {status}
      </span>
    );
  }

  if (['pending', 'deploying', 'processing', 'unverified', 'staging'].includes(str)) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
        {status}
      </span>
    );
  }

  if (['blocked', 'failed', 'failing', 'offline', 'error'].includes(str)) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
        {status}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
      {status}
    </span>
  );
};
