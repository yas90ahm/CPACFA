'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  actions?: React.ReactNode;
  status?: React.ReactNode;
}

function PageHeader({ title, subtitle, breadcrumbs, actions, status }: PageHeaderProps) {
  return (
    <div className="border-b border-[var(--border-default)] pb-[var(--space-5)] mb-[var(--space-6)]">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] mb-[var(--space-2)]">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-[var(--text-link)] transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-[var(--text-secondary)]">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-tight truncate">
              {title}
            </h1>
            {status}
          </div>
          {subtitle && (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

export { PageHeader, type PageHeaderProps };
