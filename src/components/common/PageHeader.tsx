import React, { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  badge?: ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  actions,
  badge
}) => {
  return (
    <div className="min-w-0 max-w-full flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-white/[0.06]">
      <div className="min-w-0 max-w-full space-y-1.5">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="min-w-0 max-w-full overflow-x-auto flex items-center gap-1.5 text-xs text-slate-400 mb-2">
            {breadcrumbs.map((bc, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                {bc.href ? (
                  <Link to={bc.href} className="shrink-0 hover:text-cyan-400 transition-colors">
                    {bc.label}
                  </Link>
                ) : (
                  <span className="shrink-0 text-slate-200 font-medium">{bc.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
        <div className="min-w-0 max-w-full flex flex-wrap items-center gap-2 sm:gap-3">
          <h1 className="min-w-0 break-words text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            {title}
          </h1>
          {badge && <div className="min-w-0 max-w-full">{badge}</div>}
        </div>
        {subtitle && <p className="max-w-3xl break-words text-sm text-slate-400 leading-relaxed">{subtitle}</p>}
      </div>

      {actions && <div className="min-w-0 max-w-full flex items-center gap-3 flex-wrap sm:justify-end">{actions}</div>}
    </div>
  );
};
