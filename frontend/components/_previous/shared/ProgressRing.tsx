'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  color?: string;
}

function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 5,
  label,
  color = 'var(--interactive-primary)',
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, progress));
  const offset = circumference - (clamped / 100) * circumference;
  const center = size / 2;

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      {label && (
        <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      )}
    </div>
  );
}

export { ProgressRing, type ProgressRingProps };
