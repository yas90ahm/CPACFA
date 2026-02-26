'use client';

import { useRef, useCallback, useState } from 'react';
import { FileSpreadsheet, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FileUploadZoneProps {
  onFile: (file: File) => void;
  acceptedTypes?: string[];
  maxSizeMB?: number;
  title?: string;
  subtitle?: string;
  hint?: string;
}

export function FileUploadZone(props: FileUploadZoneProps) {
  const { onFile, maxSizeMB = 50, title = 'Drop your GL export here', subtitle = 'or click to browse', hint = 'Accepted: CSV, Excel (.xlsx, .xls)' } = props;
  const acceptedTypes = props.acceptedTypes ?? ['.csv', '.xlsx', '.xls', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const maxBytes = maxSizeMB * 1024 * 1024;
  const accept = acceptedTypes.join(',');

  const handleFile = useCallback(
    (file: File | null) => {
      setSelectedFile(file || null);
      if (file) onFile(file);
    },
    [onFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f && f.size <= maxBytes) handleFile(f);
      e.target.value = '';
    },
    [handleFile, maxBytes]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f && f.size <= maxBytes) handleFile(f);
    },
    [handleFile, maxBytes]
  );

  const handleRemove = useCallback(() => {
    setSelectedFile(null);
    inputRef.current && (inputRef.current.value = '');
  }, []);

  return (
    <div className="space-y-2">
      {!selectedFile ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'min-h-[200px] border-2 border-dashed rounded-card flex flex-col items-center justify-center p-8 cursor-pointer transition-colors',
            dragOver ? 'border-accent bg-accent-dim' : 'border-border hover:border-accent hover:bg-accent-dim/50'
          )}
        >
          <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="hidden" />
          <FileSpreadsheet className={cn('w-12 h-12 mb-3', dragOver ? 'text-accent' : 'text-text-tertiary')} />
          <p className="text-sm font-medium text-primary">{dragOver ? 'Drop to upload' : title}</p>
          <p className="text-sm text-text-secondary mt-1">{subtitle}</p>
          <p className="text-xs text-text-tertiary mt-2">{hint}</p>
        </div>
      ) : (
        <div className="min-h-[80px] border border-border rounded-card p-4 flex items-center justify-between bg-surface-alt">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-10 h-10 text-text-tertiary" />
            <div>
              <p className="text-sm font-medium text-primary">{selectedFile.name}</p>
              <p className="text-xs text-text-secondary">{(selectedFile.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
          <button type="button" onClick={handleRemove} className="p-2 rounded-input text-text-secondary hover:bg-hover" aria-label="Remove file">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
