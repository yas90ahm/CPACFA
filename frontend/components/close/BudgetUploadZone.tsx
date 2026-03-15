'use client';

import { useState, useCallback, useRef } from 'react';
import { useUploadBudget } from '@/lib/queries/budget';
import { Upload, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BudgetUploadZoneProps {
  sessionId: string;
}

export function BudgetUploadZone({ sessionId }: BudgetUploadZoneProps) {
  const uploadMutation = useUploadBudget(sessionId);
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith('.csv')) {
        setStatus('error');
        setErrorMsg('Please upload a CSV file.');
        return;
      }
      setStatus('uploading');
      setErrorMsg(null);

      const reader = new FileReader();
      reader.onload = (e) => {
        const csvContent = e.target?.result as string;
        uploadMutation.mutate(csvContent, {
          onSuccess: () => {
            setStatus('success');
            setTimeout(() => setStatus('idle'), 3000);
          },
          onError: (err: Error) => {
            setStatus('error');
            setErrorMsg(err.message || 'Upload failed');
          },
        });
      };
      reader.onerror = () => {
        setStatus('error');
        setErrorMsg('Failed to read file.');
      };
      reader.readAsText(file);
    },
    [uploadMutation]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [handleFile]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => fileInputRef.current?.click()}
      className={cn(
        'relative rounded-card border-2 border-dashed p-8 text-center cursor-pointer transition-colors',
        dragActive
          ? 'border-accent bg-accent/5'
          : status === 'success'
            ? 'border-status-green bg-status-green-dim'
            : status === 'error'
              ? 'border-status-red bg-status-red-dim'
              : 'border-border bg-surface hover:border-text-muted'
      )}
      role="button"
      tabIndex={0}
      aria-label="Upload budget CSV file"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInputRef.current?.click();
        }
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleInputChange}
        className="hidden"
        aria-hidden="true"
      />
      {status === 'uploading' && (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
          <p className="text-sm text-text-secondary">Uploading budget...</p>
        </div>
      )}
      {status === 'success' && (
        <div className="flex flex-col items-center gap-2">
          <Check className="w-8 h-8 text-status-green" />
          <p className="text-sm text-status-green font-medium">Budget uploaded successfully</p>
        </div>
      )}
      {status === 'error' && (
        <div className="flex flex-col items-center gap-2">
          <AlertTriangle className="w-8 h-8 text-status-red" />
          <p className="text-sm text-status-red font-medium">{errorMsg}</p>
          <p className="text-xs text-text-secondary mt-1">Click or drop to try again</p>
        </div>
      )}
      {status === 'idle' && (
        <div className="flex flex-col items-center gap-2">
          <Upload className="w-8 h-8 text-text-muted" />
          <p className="text-sm text-text-secondary">
            Drop a budget CSV here, or <span className="text-accent font-medium">browse</span>
          </p>
          <p className="text-xs text-text-tertiary">
            CSV with columns: Account Code, Budget Amount
          </p>
        </div>
      )}
    </div>
  );
}
