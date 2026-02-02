'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AccordionContextValue {
  openItems: Set<string>;
  toggle: (value: string) => void;
  type: 'single' | 'multiple';
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null);

export interface AccordionProps {
  type?: 'single' | 'multiple';
  defaultValue?: string | string[];
  children: React.ReactNode;
  className?: string;
}

export function Accordion({
  type = 'single',
  defaultValue,
  children,
  className,
}: AccordionProps) {
  const [openItems, setOpenItems] = React.useState<Set<string>>(() => {
    if (!defaultValue) return new Set();
    const arr = Array.isArray(defaultValue) ? defaultValue : [defaultValue];
    return new Set(arr);
  });

  const toggle = React.useCallback(
    (value: string) => {
      setOpenItems((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else {
          if (type === 'single') next.clear();
          next.add(value);
        }
        return next;
      });
    },
    [type]
  );

  const value = React.useMemo(
    () => ({ openItems, toggle, type }),
    [openItems, toggle, type]
  );

  return (
    <AccordionContext.Provider value={value}>
      <div className={cn('space-y-1', className)}>{children}</div>
    </AccordionContext.Provider>
  );
}

export interface AccordionItemProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function AccordionItem({ value, children, className }: AccordionItemProps) {
  return (
    <div className={cn('rounded-md border border-border', className)} data-state={undefined}>
      {children}
    </div>
  );
}

export interface AccordionTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function AccordionTrigger({ value, children, className }: AccordionTriggerProps) {
  const ctx = React.useContext(AccordionContext);
  const isOpen = ctx?.openItems.has(value) ?? false;

  const handleClick = () => ctx?.toggle(value);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/50 transition-colors rounded-t-md [&[data-state=open]]:rounded-b-none',
        className
      )}
      aria-expanded={isOpen}
      data-state={isOpen ? 'open' : 'closed'}
    >
      {children}
      <ChevronDown
        className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
        aria-hidden
      />
    </button>
  );
}

export interface AccordionContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function AccordionContent({ value, children, className }: AccordionContentProps) {
  const ctx = React.useContext(AccordionContext);
  const isOpen = ctx?.openItems.has(value) ?? false;

  if (!isOpen) return null;

  return (
    <div
      className={cn('px-4 py-3 pt-0 border-t border-border rounded-b-md', className)}
      data-state={isOpen ? 'open' : 'closed'}
    >
      {children}
    </div>
  );
}
