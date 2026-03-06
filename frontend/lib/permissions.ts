/**
 * Role-based permission matrix for Sabit.
 *
 * Roles: admin, controller (preparer), reviewer (approver/certifier),
 *        operating_partner, auditor (future).
 */

export type Role = 'admin' | 'controller' | 'reviewer' | 'operating_partner' | 'auditor';

/**
 * Normalize backend role names to frontend role names.
 * Backend uses: accountant, preparer, reviewer, approver, certifier, admin, operating_partner
 * Frontend uses: admin, controller, reviewer, operating_partner, auditor
 */
export function normalizeRole(backendRole: string | undefined): Role {
  switch (backendRole) {
    case 'admin':
      return 'admin';
    case 'accountant':
    case 'preparer':
      return 'controller';
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
  return role === 'admin' || role === 'controller';
}

export function canReplaceGL(role: string): boolean {
  return role === 'admin' || role === 'controller';
}

export function canMapAccounts(role: string): boolean {
  return role === 'admin' || role === 'controller';
}

export function canCreateJE(role: string): boolean {
  return role === 'admin' || role === 'controller';
}

export function canProposeJE(role: string): boolean {
  return role === 'admin' || role === 'controller';
}

export function canApproveJE(role: string, createdByUserId: string, currentUserId: string): boolean {
  if (role === 'operating_partner' || role === 'auditor' || role === 'controller') return false;
  if (role === 'admin' || role === 'reviewer') {
    // SoD: cannot approve own work
    return createdByUserId !== currentUserId;
  }
  return false;
}

export function canRejectJE(role: string, createdByUserId: string, currentUserId: string): boolean {
  return canApproveJE(role, createdByUserId, currentUserId);
}

export function canPostJE(role: string): boolean {
  return role === 'admin' || role === 'controller';
}

export function canApplyTemplate(role: string): boolean {
  return role === 'admin' || role === 'controller';
}

export function canSkipTemplate(role: string): boolean {
  return role === 'admin' || role === 'controller';
}

export function canCompleteRecon(role: string): boolean {
  return role === 'admin' || role === 'controller';
}

export function canApproveRecon(role: string, preparerUserId: string, currentUserId: string): boolean {
  if (role === 'operating_partner' || role === 'auditor' || role === 'controller') return false;
  if (role === 'admin' || role === 'reviewer') {
    return preparerUserId !== currentUserId;
  }
  return false;
}

export function canGenerateStatements(role: string): boolean {
  return role === 'admin' || role === 'controller';
}

export function canExplainVariance(role: string): boolean {
  return role === 'admin' || role === 'controller';
}

export function canApproveVariance(role: string): boolean {
  return role === 'admin' || role === 'reviewer';
}

export function canSubmitForReview(role: string): boolean {
  return role === 'admin' || role === 'controller';
}

export function canCertify(role: string): boolean {
  return role === 'admin' || role === 'reviewer';
}

export function canLockPeriod(role: string): boolean {
  return role === 'admin';
}

export function canReopenPeriod(role: string): boolean {
  return role === 'admin';
}

// ── Settings Access ───────────────────────────────────────────────────────────

const SETTINGS_ACCESS: Record<string, string[]> = {
  admin: ['general', 'reconciliation', 'evidence-policy', 'taxonomy', 'integrations', 'team', 'templates'],
  controller: ['templates'],
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
  if (role === 'admin') return false;
  if (role === 'controller' && page === 'templates') return false;
  // Reviewer gets read-only access to templates and reconciliation
  return true;
}

// ── Sidebar Visibility ────────────────────────────────────────────────────────

const OP_VISIBLE_PAGES = new Set([
  'dashboard', 'trial-balance', 'statements', 'variance',
  'board-package', 'audit-trail',
]);

export function isSidebarItemVisible(role: string, href: string): boolean {
  if (role === 'operating_partner') {
    // Extract the page segment from href like /close/123/dashboard → dashboard
    const segments = href.split('/').filter(Boolean);
    const page = segments[segments.length - 1] ?? '';
    return OP_VISIBLE_PAGES.has(page);
  }
  // All other roles see everything
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
  reviewer: 'Reviewer',
  operating_partner: 'Operating Partner',
  auditor: 'Auditor',
  // Backend role names (fallback if normalizeRole wasn't called)
  accountant: 'Controller',
  preparer: 'Controller',
  approver: 'Reviewer',
  certifier: 'Reviewer',
};

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

// ── Default Landing Page ──────────────────────────────────────────────────────

export function getDefaultLandingPage(role: string): string {
  if (role === 'operating_partner' || role === 'admin') return '/portfolio';
  return '/close';
}

// ── Settings Default Redirect ─────────────────────────────────────────────────

export function getSettingsDefaultPage(role: string): string | null {
  const pages = getAccessibleSettingsPages(role);
  return pages.length > 0 ? `/settings/${pages[0]}` : null;
}
