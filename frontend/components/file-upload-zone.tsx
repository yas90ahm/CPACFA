'use client';

import * as React from 'react';
import { Upload, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { logAudit, getCurrentUserId } from '@/lib/audit-log';

export interface UploadedFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface FileUploadZoneProps {
  onUpload?: (files: File[]) => void;
  onFilesChange?: (files: UploadedFile[]) => void;
  accept?: string;
  maxFiles?: number;
  className?: string;
}

export function FileUploadZone({
  onUpload,
  onFilesChange,
  accept = '.pdf,.csv,.xlsx,.xls',
  maxFiles = 10,
  className,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const addFiles = React.useCallback(
    (newFiles: FileList | File[]) => {
      const list = Array.isArray(newFiles) ? newFiles : Array.from(newFiles);
      const next = list.slice(0, maxFiles - files.length).map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        status: 'pending' as const,
      }));
      const updated = [...files, ...next];
      setFiles(updated);
      onFilesChange?.(updated);
    },
    [files, maxFiles, onFilesChange]
  );

  const removeFile = React.useCallback(
    (id: string) => {
      const updated = files.filter((f) => f.id !== id);
      setFiles(updated);
      onFilesChange?.(updated);
    },
    [files, onFilesChange]
  );

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (selected?.length) addFiles(selected);
    e.target.value = '';
  };

  const handleUploadClick = React.useCallback(() => {
    const toUpload = files.filter((f) => f.status === 'pending');
    if (toUpload.length === 0) return;
    toUpload.forEach((uf) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === uf.id ? { ...f, status: 'uploading' as const } : f))
      );
    });
    onUpload?.(toUpload.map((u) => u.file));
    toUpload.forEach((uf) => {
      logAudit({
        userId: getCurrentUserId(),
        action: 'file_upload',
        resource: uf.file.name,
        reasoningPath: 'User uploaded audit evidence / bank statement for processing.',
      });
    });
    const next = files.map((f) =>
      toUpload.some((u) => u.id === f.id) ? { ...f, status: 'done' as const } : f
    );
    setFiles(next);
    onFilesChange?.(next);
  }, [files, onUpload, onFilesChange]);

  return (
    <Card className={cn('overflow-hidden rounded-md border border-border shadow-calm', className)}>
      <CardContent className="p-0">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-10 transition-all cursor-pointer',
            isDragging ? 'border-primary bg-primary/10 scale-[1.01]' : 'border-border hover:border-primary/40 hover:bg-muted/40'
          )}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={accept}
            onChange={handleInputChange}
            className="hidden"
          />
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Upload className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-center text-foreground">
            Drop files here or click to upload
          </p>
          <p className="text-xs text-muted-foreground">
            CSV, XLSX (max {maxFiles} files) — trial balance or audit evidence
          </p>
        </div>
        {files.length > 0 && (
          <div className="border-t border-border/50 p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Selected</p>
            <ul className="space-y-2">
              {files.map((uf) => (
                <li
                  key={uf.id}
                  className="flex items-center gap-3 rounded-md bg-muted/50 border border-border px-3 py-2 text-sm"
                >
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="flex-1 truncate font-medium">{uf.file.name}</span>
                  <span className="text-xs text-muted-foreground capitalize">{uf.status}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-md hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(uf.id);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <Button onClick={handleUploadClick} size="sm" className="w-full sm:w-auto rounded-md bg-primary hover:bg-primary/90">
              Upload {files.filter((f) => f.status === 'pending').length || files.length} file(s)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
