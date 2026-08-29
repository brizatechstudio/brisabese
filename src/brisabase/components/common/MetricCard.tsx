import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  badge?: string;
  badgeType?: 'positive' | 'neutral' | 'negative';
  accentColor?: 'purple' | 'blue' | 'cyan' | 'pink' | 'emerald' | 'amber';
  icon?: LucideIcon;
  onClick?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtext,
  badge,
  badgeType = 'positive',
  accentColor = 'purple',
  icon: Icon,
  onClick
}) => {
  const accentBorderMap = {
    purple: 'border-l-4 border-l-[#8c4be9]',
    blue: 'border-l-4 border-l-[#a644e2]',
    cyan: 'border-l-4 border-l-[#ff7045]',
    pink: 'border-l-4 border-l-[#ec3f82]',
    emerald: 'border-l-4 border-l-emerald-500',
    amber: 'border-l-4 border-l-amber-500'
  };

  return (
    <div
      onClick={onClick}
      className={`bb-panel relative overflow-hidden rounded-2xl p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-fuchsia-300/30 ${
        accentBorderMap[accentColor] || 'border-l-4 border-l-purple-500'
      } ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</span>
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400/95 via-rose-500/95 to-violet-600/95 text-white border border-white/15 shadow-lg shadow-fuchsia-950/30">
            <Icon className="h-4 w-4 text-white" />
          </div>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tracking-tight text-white">{value}</span>
        {badge && (
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
              badgeType === 'positive'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : badgeType === 'negative'
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                : 'bg-slate-800 text-slate-300 border border-slate-700'
            }`}
          >
            {badge}
          </span>
        )}
      </div>

      {subtext && <p className="mt-1 text-[10px] text-slate-500 italic">{subtext}</p>}
    </div>
  );
};
