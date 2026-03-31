'use client';

import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const variantStyles: Record<string, string> = {
  primary:
    'bg-[var(--interactive-primary)] text-white hover:bg-[var(--interactive-primary-hover)] active:bg-[var(--interactive-primary-pressed)]',
  secondary:
    'bg-[var(--interactive-secondary)] text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--interactive-secondary-hover)]',
  ghost:
    'bg-transparent text-[var(--text-primary)] hover:bg-[var(--interactive-ghost-hover)]',
  danger:
    'bg-[var(--interactive-destructive)] text-white hover:bg-[var(--interactive-destructive-hover)]',
  success:
    'bg-[var(--status-success)] text-white hover:opacity-90',
};

const sizeStyles: Record<string, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-base gap-2.5',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, icon, children, className, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-[var(--radius-md)] transition-all',
        'duration-[var(--transition-fast)] outline-none',
        'focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:pointer-events-none',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  ),
);

Button.displayName = 'Button';
export { Button, type ButtonProps };
