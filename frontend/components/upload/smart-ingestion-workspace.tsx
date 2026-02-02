'use client';

import * as React from 'react';
import { ShieldCheck, Lock, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { SmartIngestionDropzone } from './smart-ingestion-dropzone';
import type { OcrBox, OcrExtraction, SmartIngestionExtraction, ParsingError } from './types';

/** Generate mock OCR boxes for demo when backend does not return extraction */
function mockExtraction(fileName: string): SmartIngestionExtraction {
  const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    documentId: docId,
    fileName,
    pages: [
      {
        pageIndex: 0,
        pageWidth: 612,
        pageHeight: 792,
        boxes: [
          { id: 'box-1', value: '4,500,000', x: 65, y: 18, width: 14, height: 3, label: 'Revenue' },
          { id: 'box-2', value: '1,350,000', x: 65, y: 24, width: 14, height: 3, label: 'COGS' },
          { id: 'box-3', value: '675,000', x: 65, y: 32, width: 12, height: 3, label: 'Net Income' },
          { id: 'box-4', value: '8,000,000', x: 65, y: 42, width: 14, height: 3, label: 'Total Assets' },
          { id: 'box-5', value: '1,200,000', x: 65, y: 48, width: 14, height: 3, label: 'Cash' },
        ],
      },
    ],
  };
}

/** Security badge: SOC2 / GDPR compliant status bar */
function SecurityBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-4 py-2 px-4 rounded-md border bg-muted/30 text-xs text-muted-foreground',
        className
      )}
      role="status"
      aria-label="Security and compliance status"
    >
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
        SOC2 / GDPR Compliant
      </span>
      <span className="flex items-center gap-1">
        <Lock className="h-3 w-3" aria-hidden />
        Data encrypted in transit and at rest
      </span>
      <span className="flex items-center gap-1">
        <EyeOff className="h-3 w-3" aria-hidden />
        PII masked in logs and exports
      </span>
    </div>
  );
}

/** Single page: PDF area + overlay of bounding boxes */
function PdfPageWithOverlay({
  pdfUrl,
  extraction,
  editingBoxId,
  onBoxClick,
  onCorrect,
  onCancelEdit,
}: {
  pdfUrl: string;
  extraction: OcrExtraction;
  editingBoxId: string | null;
  onBoxClick: (box: OcrBox) => void;
  onCorrect: (boxId: string, newValue: string) => void;
  onCancelEdit: () => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [editValue, setEditValue] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const editingBox = extraction.boxes.find((b) => b.id === editingBoxId);

  React.useEffect(() => {
    if (editingBoxId && editingBox) {
      setEditValue(editingBox.value);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editingBoxId, editingBox?.value]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBoxId && editValue.trim() !== '') {
      onCorrect(editingBoxId, editValue.trim());
      onCancelEdit();
    }
  };

  const aspectRatio = (extraction.pageHeight / extraction.pageWidth) * 100;

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative w-full bg-muted/50 rounded-lg overflow-hidden border"
        style={{ paddingBottom: `${aspectRatio}%` }}
      >
        <div className="absolute inset-0 flex">
          <div className="relative flex-1 min-w-0 min-h-0">
            <object
              data={pdfUrl}
              type="application/pdf"
              className="absolute inset-0 w-full h-full"
              aria-label="Uploaded PDF document"
            >
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground p-4">
                PDF preview not available in this browser. Your file was received and processed.
              </div>
            </object>
            {/* Bounding box overlay (same area as content) */}
            <div
              className="absolute inset-0 pointer-events-none"
              aria-hidden
            >
              <div className="absolute inset-0" style={{ pointerEvents: 'auto' }}>
                {extraction.boxes.map((box) => (
                  <button
                    key={box.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onBoxClick(box);
                    }}
                    className={cn(
                      'absolute border-2 rounded-sm min-h-[20px] transition-colors text-left',
                      editingBoxId === box.id
                        ? 'border-primary bg-primary/20 ring-2 ring-primary/50'
                        : 'border-primary/70 bg-primary/10 hover:bg-primary/20'
                    )}
                    style={{
                      left: `${box.x}%`,
                      top: `${box.y}%`,
                      width: `${box.width}%`,
                      height: `${box.height}%`,
                      fontSize: 'clamp(10px, 1.2vw, 14px)',
                    }}
                    title={`${box.label ?? 'Value'}: ${box.value} — Click to correct`}
                  >
                    <span className="sr-only">
                      {box.label ?? 'Value'}: {box.value}. Click to correct.
                    </span>
                    <span className="pointer-events-none opacity-90 font-mono truncate block px-0.5">
                      {box.value}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {editingBox && (
        <Card className="border-primary/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Correct value</CardTitle>
            {editingBox.label && (
              <p className="text-xs text-muted-foreground font-normal">{editingBox.label}</p>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="font-mono"
                aria-label="Corrected value"
              />
              <Button type="submit" size="sm">
                Save &amp; Recalculate
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onCancelEdit}>
                Cancel
              </Button>
            </form>
            <p className="text-xs text-muted-foreground mt-2">
              Saving will immediately trigger the bot to recalculate everything from this value.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export interface SmartIngestionWorkspaceProps {
  /** Called after user corrects a value — pass updated extraction so parent can re-run pipelines */
  onRecalculate?: (extraction: SmartIngestionExtraction) => void;
  /** Optional initial extraction (e.g. from server); if not provided, mock is used after upload */
  initialExtraction?: SmartIngestionExtraction | null;
  /** Accept file types */
  accept?: string;
  className?: string;
}

export function SmartIngestionWorkspace({
  onRecalculate,
  initialExtraction,
  accept = '.pdf',
  className,
}: SmartIngestionWorkspaceProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
  const [extraction, setExtraction] = React.useState<SmartIngestionExtraction | null>(
    initialExtraction ?? null
  );
  const [editingBoxId, setEditingBoxId] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [parsingError, setParsingError] = React.useState<ParsingError | null>(null);

  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!file) {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleDropzoneFile = React.useCallback(
    (f: File) => {
      setFile(f);
      setUploading(true);
      setExtraction(null);
      setEditingBoxId(null);
      setParsingError(null);
      // Simulate OCR / extraction (replace with real API call); optionally reject with ParsingError
      return new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          const next = initialExtraction ?? mockExtraction(f.name);
          setExtraction(next);
          setUploading(false);
          resolve();
        }, 600);
      });
    },
    [initialExtraction]
  );

  const handleDropzoneReset = React.useCallback(() => {
    setFile(null);
    setExtraction(null);
    setEditingBoxId(null);
    setParsingError(null);
  }, []);

  const handleBoxClick = React.useCallback((box: OcrBox) => {
    setEditingBoxId(box.id);
  }, []);

  const handleCorrect = React.useCallback(
    (boxId: string, newValue: string) => {
      if (!extraction) return;
      const next: SmartIngestionExtraction = {
        ...extraction,
        pages: extraction.pages.map((p) => ({
          ...p,
          boxes: p.boxes.map((b) => (b.id === boxId ? { ...b, value: newValue } : b)),
        })),
      };
      setExtraction(next);
      setEditingBoxId(null);
      onRecalculate?.(next);
    },
    [extraction, onRecalculate]
  );

  const currentPage = extraction?.pages?.[0] ?? null;

  return (
    <div className={cn('space-y-4', className)}>
      <Card className="rounded-md border border-border shadow-calm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">PDF ingestion</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Upload a PDF — we extract numbers and let you correct any box before recalculating.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <SmartIngestionDropzone
            accept={accept}
            file={file}
            onFile={handleDropzoneFile}
            parsingError={parsingError}
            onReset={handleDropzoneReset}
          />

          {file && (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground truncate">
                  <span className="font-medium text-foreground">{file.name}</span>
                  {extraction && ` · ${extraction.pages.flatMap((p) => p.boxes).length} values extracted`}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFile(null);
                    setExtraction(null);
                    setEditingBoxId(null);
                    setParsingError(null);
                  }}
                >
                  Clear
                </Button>
              </div>

              {uploading && (
                <p className="text-sm text-muted-foreground">Extracting numbers…</p>
              )}

              {pdfUrl && currentPage && !uploading && (
                <PdfPageWithOverlay
                  pdfUrl={pdfUrl}
                  extraction={currentPage}
                  editingBoxId={editingBoxId}
                  onBoxClick={handleBoxClick}
                  onCorrect={handleCorrect}
                  onCancelEdit={() => setEditingBoxId(null)}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <SecurityBadge />
    </div>
  );
}
