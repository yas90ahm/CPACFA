'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  getChecklistTemplates,
  createOrUpdateChecklistTemplate,
  updateChecklistTemplate,
  type ChecklistTemplateRow,
  type ChecklistTemplateStepSpec,
} from '@/lib/apiAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const PERIOD_TYPES: { value: 'monthly' | 'quarterly' | 'annual'; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];

function periodTypeLabel(pt: string): string {
  return PERIOD_TYPES.find((p) => p.value === pt)?.label ?? pt;
}

const DEFAULT_STEPS: ChecklistTemplateStepSpec[] = [
  { label: 'Reconcile cash', category: 'Cash', verificationMethod: 'Reconciliation' },
  { label: 'Reconcile receivables', category: 'Receivables', verificationMethod: 'Reconciliation' },
  { label: 'Reconcile payables', category: 'Payables', verificationMethod: 'Reconciliation' },
];

export default function ChecklistTemplatesPage() {
  const [templates, setTemplates] = React.useState<ChecklistTemplateRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editingPeriodType, setEditingPeriodType] = React.useState<'monthly' | 'quarterly' | 'annual' | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editSteps, setEditSteps] = React.useState<ChecklistTemplateStepSpec[]>([]);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getChecklistTemplates();
      setTemplates(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const templateByType = React.useMemo(() => {
    const map: Record<string, ChecklistTemplateRow> = {};
    for (const t of templates) {
      map[t.periodType] = t;
    }
    return map;
  }, [templates]);

  const startEdit = (periodType: 'monthly' | 'quarterly' | 'annual') => {
    const existing = templateByType[periodType];
    setEditingPeriodType(periodType);
    setEditName(existing?.name ?? `${periodTypeLabel(periodType)} close`);
    setEditSteps(existing?.stepsSpec?.length ? [...existing.stepsSpec] : [...DEFAULT_STEPS]);
  };

  const cancelEdit = () => {
    setEditingPeriodType(null);
    setEditName('');
    setEditSteps([]);
  };

  const addStep = () => {
    setEditSteps((prev) => [...prev, { label: '' }]);
  };

  const removeStep = (index: number) => {
    setEditSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, patch: Partial<ChecklistTemplateStepSpec>) => {
    setEditSteps((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const handleSave = async () => {
    if (!editingPeriodType) return;
    const stepsSpec = editSteps.filter((s) => (s.label ?? '').trim() !== '');
    if (stepsSpec.length === 0) {
      setError('Add at least one step with a label');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const existing = templateByType[editingPeriodType];
      if (existing) {
        await updateChecklistTemplate(editingPeriodType, { name: editName.trim() || undefined, stepsSpec });
      } else {
        await createOrUpdateChecklistTemplate(editingPeriodType, { name: editName.trim() || undefined, stepsSpec });
      }
      await load();
      cancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Checklist templates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define default checklist steps for monthly, quarterly, and annual close. New periods use the template for their type.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          <Link href="/close" className="text-primary hover:underline">← Back to Close</Link>
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading templates…</p>
      ) : (
        <div className="space-y-4">
          {PERIOD_TYPES.map(({ value, label }) => {
            const template = templateByType[value];
            const isEditing = editingPeriodType === value;

            if (isEditing) {
              return (
                <Card key={value}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Edit {label} template</CardTitle>
                    <div className="flex items-center gap-2 pt-2">
                      <Input
                        placeholder="Template name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="max-w-xs"
                      />
                      <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Steps</span>
                      <Button size="sm" variant="outline" onClick={addStep}>Add step</Button>
                    </div>
                    <div className="rounded-md border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8">#</TableHead>
                            <TableHead>Task / label</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Verification</TableHead>
                            <TableHead className="w-24">Due offset (days)</TableHead>
                            <TableHead className="w-20"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {editSteps.map((step, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                              <TableCell>
                                <Input
                                  value={step.label ?? ''}
                                  onChange={(e) => updateStep(i, { label: e.target.value })}
                                  placeholder="Step label"
                                  className="h-8"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={step.category ?? ''}
                                  onChange={(e) => updateStep(i, { category: e.target.value || undefined })}
                                  placeholder="e.g. Cash"
                                  className="h-8"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={step.verificationMethod ?? ''}
                                  onChange={(e) => updateStep(i, { verificationMethod: e.target.value || undefined })}
                                  placeholder="e.g. Reconciliation"
                                  className="h-8"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={step.dueOffsetDays ?? ''}
                                  onChange={(e) => updateStep(i, { dueOffsetDays: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
                                  placeholder="0"
                                  className="h-8 w-20"
                                />
                              </TableCell>
                              <TableCell>
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeStep(i)}>
                                  Remove
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            return (
              <Card key={value}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-lg">{label} close</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => startEdit(value)}>
                    {template ? 'Edit' : 'Create template'}
                  </Button>
                </CardHeader>
                <CardContent>
                  {template ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{template.name}</span>
                        {' · '}
                        {template.stepsSpec?.length ?? 0} steps
                        {' · '}
                        Updated {template.updatedAt ? new Date(template.updatedAt).toLocaleDateString() : '—'}
                      </p>
                      {template.stepsSpec?.length ? (
                        <div className="mt-3 rounded-md border border-border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-8">#</TableHead>
                                <TableHead>Task</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Verification</TableHead>
                                <TableHead className="w-20">Due offset</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {template.stepsSpec.map((step, i) => (
                                <TableRow key={i}>
                                  <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                                  <TableCell className="font-medium">{step.label || '—'}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{step.category ?? '—'}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{step.verificationMethod ?? '—'}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {step.dueOffsetDays != null ? `${step.dueOffsetDays}d` : '—'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No template yet. Click &quot;Create template&quot; to define default steps for new {label.toLowerCase()} close periods.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
