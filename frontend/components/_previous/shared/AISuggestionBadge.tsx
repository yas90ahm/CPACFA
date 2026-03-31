'use client';

import { cn } from '@/lib/utils';

interface AISuggestionBadgeProps {
  label?: string;
  confidence?: number;
  modelName?: string;
  className?: string;
}

export function AISuggestionBadge({
  label = 'AI Suggestion',
  confidence,
  modelName,
  className,
}: AISuggestionBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-ai-purple-dim text-ai-purple border border-ai-purple-border',
        className
      )}
    >
      <span className="text-xs">✦</span>
      {label}
      {confidence != null && (
        <span className="text-xs opacity-75">{Math.round(confidence * 100)}%</span>
      )}
      {modelName && (
        <span className="text-xs opacity-60">· {modelName}</span>
      )}
    </span>
  );
}
