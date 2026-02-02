'use client';

import * as React from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  IngestionStageId,
  IngestionStageDef,
  StageStatus,
  ParsingError,
} from './types';

const STAGES: IngestionStageDef[] = [
  { id: 'extracting', label: 'Extracting Text', icon: '📄' },
  { id: 'classifying', label: 'Classifying Accounts', icon: '🧠' },
  { id: 'verifying', label: 'Verifying GAAP', icon: '⚖️' },
  { id: 'generating', label: 'Generating Dashboard', icon: '📊' },
];

/** Activity chip: shows stage label, pulses when active, Risk Red + click when error */
function ActivityChip({
  stage,
  status,
  error,
  onErrorClick,
}: {
  stage: IngestionStageDef;
  status: StageStatus;
  error: ParsingError | null;
  onErrorClick: (err: ParsingError) => void;
}) {
  const isError = status === 'error';
  const isActive = status === 'active';
  const isDone = status === 'done';

  const handleClick = () => {
    if (isError && error) onErrorClick(error);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isError}
      className={cn(
        'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-all',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        isError && 'cursor-pointer border-risk-red bg-risk-red/10 text-risk-red hover:bg-risk-red/20',
        isActive &&
          'border-audit-green bg-audit-green/10 text-audit-green chip-pulse',
        isDone && !isError && 'border-border bg-muted/50 text-muted-foreground',
        !isError && !isActive && !isDone && 'border-border bg-muted/30 text-muted-foreground'
      )}
      aria-pressed={isError ? undefined : false}
      aria-label={isError ? `${stage.label}: error — click to view details` : stage.label}
    >
      <span className="text-base leading-none" aria-hidden>
        {stage.icon}
      </span>
      <span>{stage.label}</span>
      {isActive && (
        <span
          className="ml-1 h-2 w-2 shrink-0 rounded-full bg-audit-green animate-pulse"
          aria-hidden
        />
      )}
    </button>
  );
}

export interface SmartIngestionDropzoneProps {
  /** Accepted file types (e.g. ".pdf" or "application/pdf") */
  accept?: string;
  /** Controlled file: when set, dropzone shows filename + chips (e.g. all done) */
  file?: File | null;
  /** Called when a file is selected/dropped and pipeline finishes; parent can set file to show result */
  onFile?: (file: File) => Promise<void> | void;
  /** Optional: externally controlled parsing error to show on a chip */
  parsingError?: ParsingError | null;
  /** Optional: callback when user clears or resets */
  onReset?: () => void;
  className?: string;
}

/** Minimalist central dropzone: dashed border, subtle Audit Green glow on drag-over. Replaces progress with Activity Chips. */
export function SmartIngestionDropzone({
  accept = '.pdf',
  file: controlledFile = null,
  onFile,
  parsingError = null,
  onReset,
  className,
}: SmartIngestionDropzoneProps) {
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [internalFile, setInternalFile] = React.useState<File | null>(null);
  const isControlled = controlledFile !== undefined;
  const file = isControlled ? controlledFile : internalFile;
  const [currentStage, setCurrentStage] = React.useState<IngestionStageId | null>(null);
  const [stageStatuses, setStageStatuses] = React.useState<Record<IngestionStageId, StageStatus>>({
    extracting: 'pending',
    classifying: 'pending',
    verifying: 'pending',
    generating: 'pending',
  });
  const [localError, setLocalError] = React.useState<ParsingError | null>(null);
  const [errorDetailsOpen, setErrorDetailsOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const error = parsingError ?? localError;

  // When external parsingError is provided, mark that stage as error
  const effectiveStatuses = React.useMemo(() => {
    if (!parsingError) return stageStatuses;
    return { ...stageStatuses, [parsingError.stageId]: 'error' as StageStatus };
  }, [stageStatuses, parsingError]);

  const runPipeline = React.useCallback(
    async (f: File) => {
      if (!isControlled) setInternalFile(f);
      setLocalError(null);
      const stages: IngestionStageId[] = ['extracting', 'classifying', 'verifying', 'generating'];
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        setCurrentStage(stage);
        setStageStatuses((prev) => ({
          ...prev,
          [stage]: 'active',
          ...(stages[i - 1] ? { [stages[i - 1]]: 'done' as StageStatus } : {}),
        }));
        // Simulate stage duration; in real app this would be API-driven
        await new Promise((r) => setTimeout(r, 400));
      }
      setStageStatuses((prev) => ({
        ...prev,
        generating: 'done',
      }));
      setCurrentStage(null);
      try {
        await onFile?.(f);
      } catch (err: unknown) {
        const parsed = err as ParsingError;
        const stageId = parsed?.stageId ?? 'extracting';
        setLocalError(parsed);
        setStageStatuses((prev) => ({ ...prev, [stageId]: 'error' }));
        setCurrentStage(null);
      }
    },
    [onFile, isControlled]
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    const ext = (f.name.split('.').pop() ?? '').toLowerCase();
    if (accept.includes('pdf') && ext !== 'pdf') return;
    runPipeline(f);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    runPipeline(f);
  };

  const handleErrorClick = (err: ParsingError) => {
    setErrorDetailsOpen(true);
  };

  const handleReset = () => {
    if (!isControlled) setInternalFile(null);
    setCurrentStage(null);
    setStageStatuses({
      extracting: 'pending',
      classifying: 'pending',
      verifying: 'pending',
      generating: 'pending',
    });
    setLocalError(null);
    setErrorDetailsOpen(false);
    onReset?.();
  };

  const isProcessing = currentStage !== null;
  const hasError = !!error;

  return (
    <div className={cn('space-y-4', className)}>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !file && inputRef.current?.click()}
        className={cn(
          'flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed transition-all',
          'cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          isDragOver
            ? 'border-audit-green bg-audit-green/5 shadow-[0_0_0_3px_hsl(var(--audit-green)/0.15)]'
            : 'border-border bg-muted/20 hover:border-muted-foreground/30 hover:bg-muted/30',
          file && 'pointer-events-none cursor-default min-h-0 py-4'
        )}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!file) inputRef.current?.click();
          }
        }}
        aria-label="Drop PDF here or click to browse"
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="hidden"
          aria-hidden
        />
        {!file ? (
          <>
            <Upload
              className={cn(
                'h-10 w-10 transition-colors',
                isDragOver ? 'text-audit-green' : 'text-muted-foreground'
              )}
              aria-hidden
            />
            <p
              className={cn(
                'text-sm font-medium transition-colors',
                isDragOver ? 'text-audit-green' : 'text-muted-foreground'
              )}
            >
              Drop a PDF here or click to browse
            </p>
            <p className="text-xs text-muted-foreground">Smart Ingestion</p>
          </>
        ) : (
          <p className="text-sm font-medium text-foreground">{file.name}</p>
        )}
      </div>

      {/* Activity Chips: show when file is set, replace progress bar */}
      {(file || isProcessing) && (
        <div className="flex flex-wrap items-center gap-2">
          {STAGES.map((stage) => (
            <ActivityChip
              key={stage.id}
              stage={stage}
              status={
                isControlled && file && !isProcessing
                  ? 'done'
                  : effectiveStatuses[stage.id]
              }
              error={error?.stageId === stage.id ? error : null}
              onErrorClick={handleErrorClick}
            />
          ))}
          {file && !isProcessing && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleReset();
              }}
              className="text-xs font-medium text-muted-foreground underline hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Error details: inline expand when user clicks error chip */}
      {errorDetailsOpen && error && (
        <div
          className="rounded-md border border-risk-red/50 bg-risk-red/5 p-3 text-sm"
          role="alert"
        >
          <p className="font-medium text-risk-red">{error.message}</p>
          {error.details && <p className="mt-1 text-muted-foreground">{error.details}</p>}
          {error.location && (
            <p className="mt-1 text-xs text-muted-foreground">Location: {error.location}</p>
          )}
          <button
            type="button"
            onClick={() => setErrorDetailsOpen(false)}
            className="mt-2 text-xs font-medium text-risk-red underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
