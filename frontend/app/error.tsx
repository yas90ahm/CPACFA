'use client';

import * as React from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '600px' }}>
      <h2 style={{ color: '#b91c1c' }}>Something went wrong</h2>
      <p style={{ margin: '1rem 0', color: '#374151' }}>{error.message}</p>
      <button
        type="button"
        onClick={reset}
        style={{
          padding: '0.5rem 1rem',
          background: '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );
}
