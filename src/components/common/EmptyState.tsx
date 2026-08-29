import React, { ReactNode } from 'react';
import { Database, FolderX, Search, Users, Zap } from 'lucide-react';
import { Button } from '../ui/Button';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  actionText?: string;
  onAction?: () => void;
  variant?: 'database' | 'search' | 'users' | 'storage' | 'general';
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  actionText,
  onAction,
  variant = 'general'
}) => {
  const defaultIcons = {
    database: <Database className="w-8 h-8 text-cyan-400" />,
    search: <Search className="w-8 h-8 text-slate-400" />,
    users: <Users className="w-8 h-8 text-indigo-400" />,
    storage: <FolderX className="w-8 h-8 text-amber-400" />,
    general: <Zap className="w-8 h-8 text-cyan-400" />
  };

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-white/10 bg-[#07111F]/40 my-4">
      <div className="w-16 h-16 rounded-2xl bg-[#0B1628] border border-white/10 flex items-center justify-center mb-4 shadow-inner">
        {icon || defaultIcons[variant]}
      </div>
      <h3 className="text-base font-bold text-slate-200">{title}</h3>
      <p className="text-xs text-slate-400 max-w-sm mt-1 mb-6 leading-relaxed">
        {description}
      </p>
      {actionText && onAction && (
        <Button size="sm" variant="gradient" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
};
