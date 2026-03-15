'use client';

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-4">
            <div className="text-4xl">⚠</div>
            <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
              Something went wrong
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Something went wrong on this page. Your data is safe.
            </p>
            {this.state.error && (
              <pre
                className="mt-2 p-3 rounded text-xs text-left overflow-auto max-h-32"
                style={{ background: 'var(--bg-surface-sunken)', color: 'var(--text-tertiary)' }}
              >
                {this.state.error.message}
              </pre>
            )}
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-4 py-2 rounded-input text-white text-sm font-medium hover:opacity-90 transition-opacity"
                style={{ background: 'var(--interactive-primary)' }}
              >
                Reload Page
              </button>
              <a
                href="#"
                className="text-sm underline hover:opacity-80 transition-opacity"
                style={{ color: 'var(--interactive-primary)' }}
              >
                Report Issue
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
