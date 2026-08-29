import React, { ReactNode } from 'react';

export type BadgeVariant =
  | 'primary'
  | 'cyan'
  | 'purple'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'
  | 'outline';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
  dot = false
}) => {
  const variantStyles: Record<BadgeVariant, { bg: string; text: string; border: string; dotColor: string }> = {
    primary: {
      bg: 'bg-[#1677FF]/15',
      text: 'text-[#38BDF8]',
      border: 'border-[#1677FF]/30',
      dotColor: 'bg-[#1677FF]'
    },
    cyan: {
      bg: 'bg-cyan-500/15',
      text: 'text-cyan-300',
      border: 'border-cyan-500/30',
      dotColor: 'bg-cyan-400'
    },
    purple: {
      bg: 'bg-purple-500/15',
      text: 'text-purple-300',
      border: 'border-purple-500/30',
      dotColor: 'bg-purple-400'
    },
    success: {
      bg: 'bg-emerald-500/15',
      text: 'text-emerald-300',
      border: 'border-emerald-500/30',
      dotColor: 'bg-emerald-400'
    },
    warning: {
      bg: 'bg-amber-500/15',
      text: 'text-amber-300',
      border: 'border-amber-500/30',
      dotColor: 'bg-amber-400'
    },
    danger: {
      bg: 'bg-rose-500/15',
      text: 'text-rose-300',
      border: 'border-rose-500/30',
      dotColor: 'bg-rose-400'
    },
    neutral: {
      bg: 'bg-slate-800/60',
      text: 'text-slate-300',
      border: 'border-slate-700/60',
      dotColor: 'bg-slate-400'
    },
    outline: {
      bg: 'bg-transparent',
      text: 'text-slate-300',
      border: 'border-white/15',
      dotColor: 'bg-slate-300'
    }
  };

  const current = variantStyles[variant];
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border whitespace-nowrap ${current.bg} ${current.text} ${current.border} ${sizeClasses} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${current.dotColor} animate-pulse`} />}
      {children}
    </span>
  );
};
