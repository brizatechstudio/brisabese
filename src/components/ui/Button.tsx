import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gradient';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  /** Compatibility alias for migrated views; prefer leftIcon for new code. */
  icon?: ReactNode;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}) => {
  const base =
    'relative inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#020617] disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]';

  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2.5 gap-2',
    lg: 'text-base px-6 py-3.5 gap-2.5'
  };

  const variantStyles = {
    primary:
      'bg-[#1677FF] hover:bg-[#1677FF]/90 text-white shadow-lg shadow-[#1677FF]/25 border border-cyan-400/20 focus:ring-[#1677FF]',
    gradient:
      'bg-gradient-to-r from-[#1677FF] to-[#12D9FF] hover:from-[#1677FF]/90 hover:to-[#12D9FF]/90 text-white font-semibold shadow-lg shadow-cyan-500/25 border border-white/20 focus:ring-cyan-400',
    secondary:
      'bg-[#0B1628] hover:bg-[#112240] text-slate-200 border border-white/[0.1] hover:border-white/20 focus:ring-slate-400',
    outline:
      'bg-transparent hover:bg-white/[0.06] text-slate-200 border border-white/15 hover:border-white/30 focus:ring-slate-400',
    ghost:
      'bg-transparent hover:bg-white/[0.08] text-slate-300 hover:text-white focus:ring-slate-400',
    danger:
      'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/25 border border-rose-500/30 focus:ring-rose-500'
  };

  return (
    <button
      className={`${base} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current shrink-0" />
      ) : (leftIcon ?? icon) ? (
        <span className="shrink-0">{leftIcon ?? icon}</span>
      ) : null}
      <span>{children}</span>
      {!isLoading && rightIcon ? <span className="shrink-0">{rightIcon}</span> : null}
    </button>
  );
};
