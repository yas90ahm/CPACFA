/**
 * Management and board reporting packs: templates, commentary library.
 */

export interface PackSectionSpec {
  id: string;
  title: string;
  /** Data source: "pl", "bs", "cash", "kpis", "variance_summary", "commentary", "one_pager" */
  dataSource: string;
  order: number;
}

export interface PackTemplate {
  id: string;
  name: string; // e.g. "Monthly CFO pack"
  sections: PackSectionSpec[];
  periodLabel?: string;
}

export interface ReportPackInput {
  templateId: string;
  periodLabel: string;
  /** Pre-computed data (or fetch from APIs) */
  pl?: Record<string, number>;
  bs?: Record<string, number>;
  cash?: Record<string, number>;
  kpis?: Record<string, number>;
  varianceSummary?: string;
  commentary?: string;
  onePager?: string;
}

export interface ReportPackResult {
  templateId: string;
  periodLabel: string;
  sections: { title: string; content: string; dataSource: string }[];
  generatedAt: string; // ISO
}

/** FW2: Pack run stored for "pack as at date" */
export interface PackRun {
  id: string;
  templateId: string;
  periodLabel: string;
  asAt: string; // ISO
  sectionCount: number;
  generatedAt: string; // ISO
}

/** Reusable variance commentary snippet */
export interface CommentarySnippet {
  id: string;
  label: string; // e.g. "Revenue down on volume"
  text: string;
  tags?: string[]; // e.g. ["revenue", "volume"]
}
