'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  FileDown,
  FileText,
  Table2,
  Shield,
  Brain,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useExportPDF, useExportCSV, type ExportParams } from '@/lib/queries/export';

export function AuditDefenseExport({
  sessionId,
  periodLabel,
  isCertified,
}: {
  sessionId: string;
  periodLabel: string;
  isCertified: boolean;
}) {
  const [includeAgentContext, setIncludeAgentContext] = useState(true);
  const exportPDF = useExportPDF();
  const exportCSV = useExportCSV();

  const exportMode: ExportParams['exportMode'] = isCertified ? 'certified' : 'draft';

  const handleExportPDF = () => {
    exportPDF.mutate({
      exportMode,
      closeSessionId: sessionId,
      periodLabel,
      agent_context: includeAgentContext,
    });
  };

  const handleExportCSV = () => {
    exportCSV.mutate({
      exportMode,
      closeSessionId: sessionId,
      periodLabel,
      agent_context: includeAgentContext,
    });
  };

  return (
    <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-[#7C5CFC]/10 flex items-center justify-center">
          <FileDown className="w-4 h-4 text-[#7C5CFC]" />
        </div>
        <div>
          <h3 className="text-xs font-semibold text-white">Audit Defense Export</h3>
          <p className="text-[10px] text-gray-600">
            {isCertified ? 'Certified export with Ed25519 signature' : 'Draft export — not certified'}
          </p>
        </div>
      </div>

      {/* Mode indicator */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-xs mb-4',
        isCertified
          ? 'bg-emerald-500/5 border border-emerald-500/20 text-emerald-400'
          : 'bg-amber-500/5 border border-amber-500/20 text-amber-400'
      )}>
        {isCertified ? (
          <>
            <Shield className="w-3.5 h-3.5" />
            <span>Certified mode — export includes Ed25519 digital signature and snapshot hash</span>
          </>
        ) : (
          <>
            <Shield className="w-3.5 h-3.5" />
            <span>Draft mode — watermarked, no certification signature</span>
          </>
        )}
      </div>

      {/* Agent context toggle */}
      <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#1a1d2e] cursor-pointer transition-colors mb-4">
        <input
          type="checkbox"
          checked={includeAgentContext}
          onChange={(e) => setIncludeAgentContext(e.target.checked)}
          className="w-4 h-4 rounded border-[#262C48] bg-[#0d1017] text-[#7C5CFC] focus:ring-[#7C5CFC]/50"
        />
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-[#7C5CFC]" />
          <span className="text-xs text-gray-300">Include AI reasoning chain</span>
        </div>
        <span className="text-[10px] text-gray-600 ml-auto">Appends agent confidence scores and rationale</span>
      </label>

      {/* Export buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handleExportPDF}
          disabled={exportPDF.isPending}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-[#262C48] text-sm text-gray-300 hover:bg-[#1a1d2e] hover:text-white disabled:opacity-50 transition-colors"
        >
          {exportPDF.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileText className="w-4 h-4 text-red-400" />
          )}
          <span>Export PDF</span>
        </button>
        <button
          type="button"
          onClick={handleExportCSV}
          disabled={exportCSV.isPending}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-[#262C48] text-sm text-gray-300 hover:bg-[#1a1d2e] hover:text-white disabled:opacity-50 transition-colors"
        >
          {exportCSV.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Table2 className="w-4 h-4 text-emerald-400" />
          )}
          <span>Export CSV</span>
        </button>
      </div>

      {/* Success feedback */}
      {(exportPDF.isSuccess || exportCSV.isSuccess) && (
        <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 text-xs">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Export downloaded successfully</span>
        </div>
      )}

      {/* Error feedback */}
      {(exportPDF.isError || exportCSV.isError) && (
        <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20 text-red-400 text-xs">
          <Shield className="w-3.5 h-3.5" />
          <span>{(exportPDF.error ?? exportCSV.error)?.message ?? 'Export failed'}</span>
        </div>
      )}
    </div>
  );
}
