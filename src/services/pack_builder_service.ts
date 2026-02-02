/**
 * Management and board reporting packs: template fill from live data.
 */

import type {
  PackTemplate,
  PackSectionSpec,
  ReportPackInput,
  ReportPackResult,
} from '../types/reporting_packs.js';

const defaultTemplates = new Map<string, PackTemplate>();

function registerDefaultTemplates(): void {
  if (defaultTemplates.size > 0) return;
  defaultTemplates.set('monthly-cfo', {
    id: 'monthly-cfo',
    name: 'Monthly CFO pack',
    sections: [
      { id: 'pl', title: 'P&L Summary', dataSource: 'pl', order: 1 },
      { id: 'bs', title: 'Balance Sheet', dataSource: 'bs', order: 2 },
      { id: 'cash', title: 'Cash', dataSource: 'cash', order: 3 },
      { id: 'kpis', title: 'KPIs', dataSource: 'kpis', order: 4 },
      { id: 'variance', title: 'Variance Summary', dataSource: 'variance_summary', order: 5 },
      { id: 'commentary', title: 'Commentary', dataSource: 'commentary', order: 6 },
      { id: 'one_pager', title: 'Executive One-Pager', dataSource: 'one_pager', order: 7 },
    ],
  });
}
registerDefaultTemplates();

export function getPackTemplate(id: string): PackTemplate | undefined {
  registerDefaultTemplates();
  return defaultTemplates.get(id);
}

export function listPackTemplates(): PackTemplate[] {
  registerDefaultTemplates();
  return Array.from(defaultTemplates.values());
}

function formatSectionContent(dataSource: string, input: ReportPackInput): string {
  switch (dataSource) {
    case 'pl':
      return input.pl ? Object.entries(input.pl).map(([k, v]) => `${k}: ${v}`).join('\n') : 'No P&L data.';
    case 'bs':
      return input.bs ? Object.entries(input.bs).map(([k, v]) => `${k}: ${v}`).join('\n') : 'No BS data.';
    case 'cash':
      return input.cash ? Object.entries(input.cash).map(([k, v]) => `${k}: ${v}`).join('\n') : 'No cash data.';
    case 'kpis':
      return input.kpis ? Object.entries(input.kpis).map(([k, v]) => `${k}: ${v}`).join('\n') : 'No KPI data.';
    case 'variance_summary':
      return input.varianceSummary ?? 'No variance summary.';
    case 'commentary':
      return input.commentary ?? 'No commentary.';
    case 'one_pager':
      return input.onePager ?? 'No one-pager.';
    default:
      return '';
  }
}

export function buildReportPack(input: ReportPackInput): ReportPackResult | null {
  registerDefaultTemplates();
  const template = defaultTemplates.get(input.templateId);
  if (!template) return null;
  const sections = [...template.sections].sort((a, b) => a.order - b.order);
  const resultSections = sections.map((s) => ({
    title: s.title,
    content: formatSectionContent(s.dataSource, input),
    dataSource: s.dataSource,
  }));
  return {
    templateId: input.templateId,
    periodLabel: input.periodLabel,
    sections: resultSections,
    generatedAt: new Date().toISOString(),
  };
}
