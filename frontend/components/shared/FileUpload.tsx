'use client';

import { useRef, useCallback } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FileUploadProps {
  onUpload: (file: File) => Promise<void>;
  acceptedTypes?: string[];
  maxSizeMB?: number;
  disabled?: boolean;
}

export function FileUpload(props: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const maxBytes = ((props.maxSizeMB ?? 10) * 1024) * 1024;
  const accept = (props.acceptedTypes ?? ['application/pdf', 'image/png', 'image/jpeg']).join(',');

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f || props.disabled || f.size > maxBytes) return;
      await props.onUpload(f);
      e.target.value = '';
    },
    [props.onUpload, props.disabled, maxBytes]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (!f || props.disabled || f.size > maxBytes) return;
      await props.onUpload(f);
    },
    [props.onUpload, props.disabled, maxBytes]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'border-2 border-dashed rounded-card p-6 text-center cursor-pointer border-border',
        props.disabled ? 'opacity-60' : 'hover:border-accent hover:bg-accent-dim'
      )}
    >
      <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="hidden" disabled={props.disabled} />
      <Upload className="w-8 h-8 mx-auto text-text-tertiary mb-2" />
      <p className="text-sm text-primary">Drop files here or click to browse</p>
      <p className="text-xs text-text-tertiary mt-1">Max {props.maxSizeMB ?? 10}MB</p>
    </div>
  );
}
