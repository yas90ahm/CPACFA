/**
 * Role-based permission matrix for Sabit.
 *
 * 4 Personas:
 *   operating_partner — PE operating partner. Portfolio-level only. Read-only.
 *   fund_controller   — Fund controller. All entities, consolidation, intercompany.
 *   reviewer          — Entity CFO/reviewer. Review, certify, sign.
 *   controller        — Entity controller. Full close workflow.
 *
 * Plus: admin (superuser), auditor (read-only audit access).
 */

export type Role = 'admin' | 'controller' | 'fund_controller' | 'reviewer' | 'operating_partner' | 'auditor';

/**
 * Normalize backend role names to frontend role names.
 * Backend uses: accountant, preparer, reviewer, approver, certifier, admin, operating_partner, fund_controller
 * Frontend uses: admin, controller, fund_controller, reviewer, operating_partner, auditor
 */
export function normalizeRole(backendRole: string | undefined): Role {
  switch (backendRole) {
    case 'admin':
      return 'admin';
    case 'accountant':
    case 'preparer':
      return 'controller';
    case 'fund_controller':
      return 'fund_controller';
    case 'reviewer':
      return 'reviewer';
    case 'approver':
    case 'certifier':
      return 'reviewer';
    case 'operating_partner':
      return 'operating_partner';
    case 'auditor':
      return 'auditor';
    default:
      return 'controller';
  }
}

// ── Capabilities ──────────────────────────────────────────────────────────────

export function canUploadGL(role: string): boolean {
  return role === 'admin' || role === 'controller' || role === 'fund_controller';
}

export function canReplaceGL(role: string): boolean {
  return role === 'admin' || role === 'controller' || role === 'fund_controller';
}

export function canMapAccounts(role: string): boolean {
  return role === 'admin' || role === 'controller' || role === 'fund_controller';
}

export function canCreateJE(role: string): boolean {
  return role === 'admin' || role === 'controller' || role === 'fund_controller';
}

export function canProposeJE(role: string): boolean {
  return role === 'admin' || role === 'controller' || role === 'fund_controller';
}

export function canApproveJE(role: string, createdByUserId: string, currentUserId: string): boolean {
  if (role === 'operating_partner' || role === 'auditor' || role === 'controller') return false;
  if (role === 'admin' || role === 'reviewer' || role === 'fund_controller') {
    // SoD: cannot approve own work
    return createdByUserId !== currentUserId;
  }
  return false;
}

export function canRejectJE(role: string, createdByUserId: string, currentUserId: string): boolean {
  return canApproveJE(role, createdByUserId, currentUserId);
}

export function canPostJE(role: string): boolean {
  return role === 'admin' || role === 'controller' || role === 'fund_controller';
}

export function canApplyTemplate(role: string): boolean {
  return role === 'admin' || role === 'controller' || role === 'fund_controller';
}

export function canSkipTemplate(role: string): boolean {
  return role === 'admin' || role === 'controller' || role === 'fund_controller';
}

export function canCompleteRecon(role: string): boolean {
  return role === 'admin' || role === 'controller' || role === 'fund_controller';
}

export function canApproveRecon(role: string, preparerUserId: string, currentUserId: string): boolean {
  if (role === 'operating_partner' || role === 'auditor' || role === 'controller') return false;
  if (role === 'admin' || role === 'reviewer' || role === 'fund_controller') {
    return preparerUserId !== currentUserId;
  }
  return false;
}

export function canGenerateStatements(role: string): boolean {
  return role === 'admin' || role === 'controller' || role === 'fund_controller';
}

export function canExplainVariance(role: string): boolean {
  return role === 'admin' || role === 'controller' || role === 'fund_controller';
}

export function canApproveVariance(role: string): boolean {
  return role === 'admin' || role === 'reviewer' || role === 'fund_controller';
}

export function canSubmitForReview(role: string): boolean {
  return role === 'admin' || role === 'controller' || role === 'fund_controller';
}

export function canCertify(role: string): boolean {
  return role === 'admin' || role === 'reviewer' || role === 'fund_controller';
}

export function canLockPeriod(role: string): boolean {
  return role === 'admin' || role === 'fund_controller';
}

export function canReopenPeriod(role: string): boolean {
  return role === 'admin' || role === 'fund_controller';
}

// ── Settings Access ───────────────────────────────────────────────────────────

const SETTINGS_ACCESS: Record<string, string[]> = {
  admin: ['general', 'reconciliation', 'evidence-policy', 'taxonomy', 'integrations', 'team', 'templates'],
  controller: ['templates'],
  fund_controller: ['general', 'reconciliation', 'evidence-policy', 'taxonomy', 'integrations', 'team', 'templates'],
  reviewer: ['templates', 'reconciliation'],
  operating_partner: [],
  auditor: [],
};

export function canAccessSettings(role: string): boolean {
  return (SETTINGS_ACCESS[role] ?? []).length > 0;
}

export function canAccessSettingsPage(role: string, page: string): boolean {
  return (SETTINGS_ACCESS[role] ?? []).includes(page);
}

export function getAccessibleSettingsPages(role: string): string[] {
  return SETTINGS_ACCESS[role] ?? [];
}

export function isSettingsReadOnly(role: string, page: string): boolean {
  if (role === 'admin' || role === 'fund_controller') return false;
  if (role === 'controller' && page === 'templates') return false;
  return true;
}

// ── Sidebar Visibility (per-persona) ─────────────────────────────────────────

/** Pages visible to operating_partner when drilling into an entity */
const OP_VISIBLE_PAGES = new Set([
  'dashboard', 'statements', 'variance', 'board-package', 'audit-trail',
]);

/** Pages visible to CFO/reviewer */
const REVIEWER_VISIBLE_PAGES = new Set([
  'dashboard', 'review', 'statements', 'variance', 'ai-review', 'audit-trail', 'discrepancies', 'checklist',
]);

/** Pages visible to auditor (read-only) */
const AUDITOR_VISIBLE_PAGES = new Set([
  'dashboard', 'trial-balance', 'statements', 'variance',
  'board-package', 'audit-trail', 'reconciliation', 'adjustments', 'controls',
]);

export function isSidebarItemVisible(role: string, href: string): boolean {
  const segments = href.split('/').filter(Boolean);
  const page = segments[segments.length - 1] ?? '';

  if (role === 'operating_partner') return OP_VISIBLE_PAGES.has(page);
  if (role === 'reviewer') return REVIEWER_VISIBLE_PAGES.has(page);
  if (role === 'auditor') return AUDITOR_VISIBLE_PAGES.has(page);
  // controller, fund_controller, admin see everything
  return true;
}

export function shouldShowSettingsInSidebar(role: string): boolean {
  return canAccessSettings(role);
}

// ── Read-Only ─────────────────────────────────────────────────────────────────

export function isReadOnly(role: string): boolean {
  return role === 'operating_partner' || role === 'auditor';
}

// ── Role Display ──────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  controller: 'Controller',
  fund_controller: 'Fund Controller',
  reviewer: 'CFO / Reviewer',
  operating_partner: 'Operating Partner',
  auditor: 'Auditor',
  // Backend role names (fallback if normalizeRole wasn't called)
  accountant: 'Controller',
  preparer: 'Controller',
  approver: 'CFO / Reviewer',
  certifier: 'CFO / Reviewer',
};

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

// ── Persona Types ─────────────────────────────────────────────────────────────

export type Persona = 'operating_partner' | 'fund_controller' | 'reviewer' | 'controller';

export function getPersona(role: string): Persona {
  if (role === 'operating_partner') return 'operating_partner';
  if (role === 'fund_controller' || role === 'admin') return 'fund_controller';
  if (role === 'reviewer') return 'reviewer';
  return 'controller';
}

// ── Default Landing Page ──────────────────────────────────────────────────────

export function getDefaultLandingPage(role: string): string {
  const persona = getPersona(role);
  if (persona === 'operating_partner') return '/portfolio';
  if (persona === 'fund_controller') return '/close';
  if (persona === 'reviewer') return '/close';
  return '/close'; // controller
}

// ── Settings Default Redirect ─────────────────────────────────────────────────

export function getSettingsDefaultPage(role: string): string | null {
  const pages = getAccessibleSettingsPages(role);
  return pages.length > 0 ? `/settings/${pages[0]}` : null;
}
