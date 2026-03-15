'use client';
import { useEffect, useCallback } from 'react';

interface ShortcutConfig {
  key: string;           // The key (e.g., 'k', 'b', 's', 'Escape')
  ctrl?: boolean;        // Requires Ctrl/Cmd
  handler: () => void;
  enabled?: boolean;     // default true
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger when user is typing in an input/textarea/select
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
      // Only allow Escape to pass through
      if (e.key !== 'Escape') return;
    }

    for (const s of shortcuts) {
      if (s.enabled === false) continue;
      const ctrlMatch = s.ctrl ? (e.ctrlKey || e.metaKey) : true;
      if (e.key.toLowerCase() === s.key.toLowerCase() && ctrlMatch) {
        e.preventDefault();
        s.handler();
        return;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
