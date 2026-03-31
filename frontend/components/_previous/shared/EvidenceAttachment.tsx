'use client';

import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { FileText, Image, Table, Upload, Trash2, Copy, Check, AlertCircle } from 'lucide-react';

export interface EvidenceFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  hash: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface EvidenceAttachmentProps {
  attachments: EvidenceFile[];
  onUpload: (file: File) => void;
  onRemove?: (id: string) => void;
  acceptedTypes?: string[];
  maxSize?: number;
  readOnly?: boolean;
  required?: boolean;
  className?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return Table;
  return FileText;
}

function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-4)}`;
}

function HashBadge({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [hash]);

  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[0.6875rem] cursor-pointer group"
      style={{ color: 'var(--text-secondary)' }}
      title={hash}
      onClick={copy}
    >
      {truncateHash(hash)}
      {copied
        ? <Check className="w-3 h-3" style={{ color: 'var(--status-success)' }} />
        : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      }
    </span>
  );
}

export function EvidenceAttachment({
  attachments,
  onUpload,
  onRemove,
  acceptedTypes = ['.pdf', '.csv', '.xlsx', '.xls', '.jpg', '.png'],
  maxSize = 50 * 1024 * 1024,
  readOnly = false,
  required = false,
  className,
}: EvidenceAttachmentProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setError(null);
    if (file.size > maxSize) {
      setError(`File exceeds ${formatSize(maxSize)} limit`);
      return;
    }
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (acceptedTypes.length && !acceptedTypes.includes(ext)) {
      setError(`Unsupported file type. Accepted: ${acceptedTypes.join(', ')}`);
      return;
    }
    onUpload(file);
  }, [maxSize, acceptedTypes, onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const showWarning = required && attachments.length === 0;

  return (
    <div className={cn('space-y-3', className)}>
      {/* File list */}
      {attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map((f) => {
            const Icon = getFileIcon(f.mimeType);
            return (
              <div
                key={f.id}
                className="flex items-center gap-3 py-2 px-3 rounded-md"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{f.fileName}</p>
                  <div className="flex items-center gap-3 text-[0.6875rem]" style={{ color: 'var(--text-secondary)' }}>
                    <span>{formatSize(f.fileSize)}</span>
                    <span>{f.uploadedBy}</span>
                    <span>{new Date(f.uploadedAt).toLocaleDateString()}</span>
                    <HashBadge hash={f.hash} />
                  </div>
                </div>
                {!readOnly && onRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove(f.id)}
                    className="p-1 rounded transition-colors"
                    style={{ color: 'var(--text-tertiary)' }}
                    aria-label="Remove file"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Upload zone */}
      {!readOnly && (
        <div
          className={cn(
            'flex flex-col items-center justify-center gap-2 py-6 px-4 rounded-lg cursor-pointer transition-colors',
          )}
          style={{
            border: showWarning
              ? '1.5px dashed var(--status-warning)'
              : dragOver
                ? '1.5px dashed var(--interactive-primary)'
                : '1.5px dashed var(--border-default)',
            backgroundColor: dragOver ? 'var(--bg-table-row-hover)' : 'var(--bg-surface-sunken)',
            borderRadius: 'var(--radius-lg)',
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Drop file or click to upload
          </p>
          <p className="text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
            {acceptedTypes.join(', ')} &middot; Max {formatSize(maxSize)}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={acceptedTypes.join(',')}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {showWarning && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium"
          style={{
            color: 'var(--status-warning)',
            backgroundColor: 'var(--status-warning-bg)',
            border: '1px solid var(--status-warning-border)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Evidence required before completion
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: 'var(--status-error)' }}>{error}</p>
      )}
    </div>
  );
}
