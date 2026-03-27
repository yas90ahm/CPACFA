/**
 * Module proposal transparency types.
 * Every accounting module returns computationInputs + dataQualityFlags
 * so the controller can see HOW Sabit computed each proposal.
 *
 * Design System Principle 1 (No Black Box AI):
 *   Every Accept/Reject is accompanied by the Why.
 */

export interface DataQualityFlag {
  /** Amber warning message shown on proposal card */
  message: string;
  /** Which input triggered the flag */
  field: string;
  /** Severity: warning (amber) or info (muted) */
  severity: 'warning' | 'info';
}

export interface ModuleProposalMeta {
  /** Module identifier */
  module: string;
  /** ASC/IFRS standard reference */
  standard?: string;
  /** What data the module used to compute the proposal */
  computationInputs: Record<string, unknown>;
  /** Flags for suspicious inputs the controller should verify */
  dataQualityFlags: DataQualityFlag[];
  /** The JE ID created (if any) */
  jeId?: string;
  /** Whether the module was skipped and why */
  skipped?: boolean;
  skipReason?: string;
}
