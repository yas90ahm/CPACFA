'use client';

import { useState } from 'react';
import { FileText, Image, FileSpreadsheet, Trash2, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EvidenceFile } from '@/lib/types/evidence';

export interface FileListProps {
  files: EvidenceFile[];
  onDelete?: (fileId: string) => void;
  showHash?: boolean;
  readonly?: boolean;
}

function iconFor(mime: string) {
  if (mime.includes('pdf')) return FileText;
  if (mime.includes('image') || mime.includes('png') || mime.includes('jpeg')) return Image;
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return FileSpreadsheet;
  return FileText;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileList(p: FileListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <ul className="space-y-2">
      {p.files.map((f) => {
        const Icon = iconFor(f.mimeType);
        const expanded = expandedId === f.id;
        return (
          <li key={f.id} className="rounded-input border border-border-light bg-elevated p-3">
            <div className="flex items-start gap-3">
              <Icon className="w-5 h-5 text-text-tertiary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-primary text-sm truncate">{f.fileName}</div>
                <div className="text-xs text-text-secondary mt-0.5">
                  {formatSize(f.fileSize)} · {f.uploadedBy} · {new Date(f.uploadedAt).toLocaleString()}
                </div>
                {p.showHash && (
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : f.id)}
                    className="flex items-center gap-1 mt-1 text-xs text-text-tertiary hover:text-primary"
                  >
                    SHA-256: {expanded ? f.sha256Hash : `${f.sha256Hash.slice(0, 16)}...`}
                    {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a href={f.downloadUrl} className="p-1.5 rounded text-text-tertiary hover:text-primary hover:bg-hover" title="Download">
                  <Download className="w-4 h-4" />
                </a>
                {!p.readonly && p.onDelete && (
                  <button
                    type="button"
                    onClick={() => p.onDelete?.(f.id)}
                    className="p-1.5 rounded text-text-tertiary hover:text-status-red hover:bg-status-red-dim"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
