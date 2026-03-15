'use client';

import { useState, useEffect } from 'react';

export function DesktopOnlyGuard() {
  const [tooSmall, setTooSmall] = useState(false);

  useEffect(() => {
    const check = () => setTooSmall(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!tooSmall) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-8"
      style={{ background: 'var(--bg-base)' }}
    >
      <div className="text-center max-w-md">
        <span
          className="font-display text-2xl tracking-[0.2em] uppercase"
          style={{ color: 'var(--text-primary)' }}
        >
          Sabit
        </span>
        <p
          className="mt-6 text-sm leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          Sabit is designed for desktop browsers. For the best experience, use a screen width of 1280 pixels or wider.
        </p>
      </div>
    </div>
  );
}
