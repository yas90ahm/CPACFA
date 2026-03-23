'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  useInventoryReserve,
  useUploadInventoryAging,
  useComputeReserve,
  useProposeReserveAJE,
} from '@/lib/queries/inventory-reserve';
import { DataTable } from '@/components/shared/DataTable';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { fmtMoney } from '@/lib/money';
import type { InventoryReserveComputation } from '@/lib/types/inventory-reserve';
import { Upload, Calculator, FileText } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isReadOnly as isRoleReadOnly } from '@/lib/permissions';

const BUCKET_LABELS: Record<string, string> = {
  current: 'Current (0-90 days)',
  '91_180': '91-180 days',
  '181_365': '181-365 days',
  over_365: 'Over 365 days',
};

export default function InventoryReservePage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const { data, isLoading } = useInventoryReserve(sessionId);
  const uploadAging = useUploadInventoryAging(sessionId);
  const computeReserve = useComputeReserve(sessionId);
  const proposeAJE = useProposeReserveAJE(sessionId);

  const { user } = useAuth();
  const readOnly = isRoleReadOnly(user?.role ?? 'controller');

  const [entityId, setEntityId] = useState('');
  const [fileInput, setFileInput] = useState<File | null>(null);

  const aging = data?.aging ?? null;
  const computations = data?.computations ?? [];
  const latestComp = computations[0] ?? null;

  const handleUpload = async () => {
    if (!fileInput || !entityId) return;
    const buffer = await fileInput.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), '')
    );
    uploadAging.mutate({ entityId, csvData: base64 });
  };

  const handleCompute = () => {
    if (!aging || !entityId) return;
    computeReserve.mutate({ entityId, snapshotId: aging.snapshotId });
  };

  const handleProposeAJE = () => {
    if (!latestComp || !entityId) return;
    proposeAJE.mutate({ entityId, computationId: latestComp.id });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>
          Inventory Obsolescence Reserve (ASC 330)
        </h1>
      </div>

      {/* Upload Section */}
      {!readOnly && (
        <div className="p-4 rounded-lg space-y-3" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
          <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>Import Inventory Aging</h3>
          <div className="flex items-center gap-3">
            <input
              placeholder="Entity ID"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="rounded-md px-2 py-1.5 text-sm flex-1"
              style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }}
            />
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFileInput(e.target.files?.[0] ?? null)}
              className="text-sm"
              style={{ color: 'var(--text-secondary)' }}
            />
            <button
              onClick={handleUpload}
              disabled={!fileInput || !entityId || uploadAging.isPending}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-white rounded-md disabled:opacity-50"
              style={{ background: 'var(--interactive-primary)' }}
            >
              <Upload className="w-4 h-4" /> Upload
            </button>
          </div>
        </div>
      )}

      {/* Aging Summary */}
      {aging && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Aging Summary</h2>
            {!readOnly && (
              <button
                onClick={handleCompute}
                disabled={computeReserve.isPending}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-white rounded-md disabled:opacity-50"
                style={{ background: 'var(--interactive-primary)' }}
              >
                <Calculator className="w-4 h-4" /> Compute Reserve
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Inventory</div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(aging.totalInventory)}</div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{aging.totalItems} items</div>
            </div>
            {Object.entries(aging.buckets).map(([key, bucket]) => (
              <div key={key} className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{BUCKET_LABELS[key] ?? key}</div>
                <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(bucket.total)}</div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{bucket.count} items</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reserve Computation */}
      {computations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Reserve Computation</h2>
            {!readOnly && latestComp && !latestComp.journalEntryId && (
              <button
                onClick={handleProposeAJE}
                disabled={proposeAJE.isPending}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-white rounded-md disabled:opacity-50"
                style={{ background: 'var(--interactive-primary)' }}
              >
                <FileText className="w-4 h-4" /> Propose AJE
              </button>
            )}
          </div>

          <DataTable<InventoryReserveComputation>
            rows={computations}
            getRowId={(r) => r.id}
            loading={isLoading}
            columns={[
              { id: 'totalInventory', header: 'Total Inventory', cell: (r) => <MoneyCell value={r.totalInventory} /> },
              { id: 'requiredReserve', header: 'Required Reserve', cell: (r) => <MoneyCell value={r.requiredReserve} /> },
              { id: 'currentGlReserve', header: 'Current GL Reserve', cell: (r) => <MoneyCell value={r.currentGlReserve} /> },
              { id: 'adjustmentNeeded', header: 'Adjustment Needed', cell: (r) => <MoneyCell value={r.adjustmentNeeded} /> },
              { id: 'reserveCurrent', header: 'Rsv Current', cell: (r) => <MoneyCell value={r.reserveCurrent} /> },
              { id: 'reserve91_180', header: 'Rsv 91-180', cell: (r) => <MoneyCell value={r.reserve91_180} /> },
              { id: 'reserve181_365', header: 'Rsv 181-365', cell: (r) => <MoneyCell value={r.reserve181_365} /> },
              { id: 'reserveOver365', header: 'Rsv 365+', cell: (r) => <MoneyCell value={r.reserveOver365} /> },
              { id: 'aje', header: 'AJE', cell: (r) => r.journalEntryId ? 'Proposed' : '\u2014' },
            ]}
          />
        </div>
      )}

      {!aging && !isLoading && (
        <div className="p-8 text-center rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No inventory aging data. Upload a CSV to begin the reserve analysis.
          </div>
        </div>
      )}
    </div>
  );
}
