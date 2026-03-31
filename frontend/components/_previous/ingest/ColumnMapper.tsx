'use client';

import { useMemo } from 'react';
import type { FieldMapping } from '@/lib/types/ingest';

export interface ColumnMapperProps {
  columns: string[];
  requiredFields: FieldMapping[];
  autoDetectedMappings?: Record<string, string>;
  onMappingComplete?: (mappings: Record<string, string>) => void;
  previewData: Record<string, string>[];
  value: Record<string, string>;
  onChange: (mappings: Record<string, string>) => void;
}

export function ColumnMapper({
  columns,
  requiredFields,
  autoDetectedMappings = {},
  previewData,
  value,
  onChange,
}: ColumnMapperProps) {
  const allRequiredMapped = useMemo(() => {
    return requiredFields.filter((f) => f.required).every((f) => value[f.fieldId]?.trim());
  }, [requiredFields, value]);

  // Derive preview columns from actual data keys (accounts summary may use different keys than raw CSV headers)
  const previewColumns = useMemo(() => {
    if (previewData.length === 0) return columns;
    const dataKeys = Object.keys(previewData[0]);
    // If data keys match CSV headers, use CSV headers; otherwise use data's own keys
    const hasMatch = columns.some((c) => dataKeys.includes(c));
    return hasMatch ? columns : dataKeys;
  }, [previewData, columns]);

  const updateMapping = (fieldId: string, column: string) => {
    onChange({ ...value, [fieldId]: column });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-secondary">Map your file columns to the required fields:</p>
      <div className="space-y-3">
        {requiredFields.map((field) => (
          <div key={field.fieldId} className="flex items-center gap-4">
            <label className="w-40 text-sm font-medium text-primary shrink-0">
              {field.label}
              {field.required && ' *'}
            </label>
            <select
              value={value[field.fieldId] ?? ''}
              onChange={(e) => updateMapping(field.fieldId, e.target.value)}
              className="flex-1 max-w-xs rounded-input border border-border bg-input px-3 py-2 text-sm"
            >
              <option value="">— Select column —</option>
              {columns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
            {autoDetectedMappings[field.fieldId] === value[field.fieldId] && value[field.fieldId] && (
              <span className="text-xs text-text-tertiary">Auto-detected</span>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-text-tertiary">* Required fields</p>

      <div className="border-t border-border pt-4">
        <p className="text-sm font-medium text-text-secondary mb-2">Data preview (first {Math.min(previewData.length, 10)} rows)</p>
        <div className="overflow-x-auto rounded-input border border-border">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-alt">
                {previewColumns.map((col) => (
                  <th key={col} className="text-left py-2 px-3 font-medium text-text-secondary">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewData.slice(0, 10).map((row, i) => (
                <tr key={i} className="border-b border-border-light">
                  {previewColumns.map((col) => (
                    <td key={col} className="py-1.5 px-3 font-mono text-xs">
                      {row[col] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
