import type { LucideIcon } from 'lucide-react';
import {
  Award,
  BarChart3,
  Building2,
  Clock,
  DollarSign,
  FileStack,
  Landmark,
  Layers,
  Package,
  Receipt,
  ShieldAlert,
  TrendingDown,
  Users,
} from 'lucide-react';

export type FrontendAccountingStandard = 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP';

export interface AccountingModuleDefinition {
  id: string;
  number: string;
  name: string;
  guidance: string;
  fullGuidance: string;
  description: string;
  method: string;
  icon: LucideIcon;
}

interface ModuleBase {
  id: string;
  number: string;
  icon: LucideIcon;
}

interface ModuleFrameworkCopy {
  name: string;
  guidance: string;
  fullGuidance: string;
  description: string;
  method: string;
}

const BASES: ModuleBase[] = [
  { id: 'prepaids', number: '01', icon: Clock },
  { id: 'fixed-assets', number: '02', icon: Building2 },
  { id: 'payroll', number: '03', icon: Users },
  { id: 'debt-interest', number: '04', icon: Landmark },
  { id: 'deferred-tax', number: '05', icon: Receipt },
  { id: 'leases', number: '06', icon: FileStack },
  { id: 'inventory', number: '07', icon: Package },
  { id: 'stock-comp', number: '08', icon: Award },
  { id: 'impairment', number: '09', icon: TrendingDown },
  { id: 'ap-aging', number: '10', icon: BarChart3 },
  { id: 'ar-cecl', number: '11', icon: ShieldAlert },
  { id: 'segments', number: '12', icon: Layers },
  { id: 'revenue', number: '13', icon: DollarSign },
];

const MODULE_ALIASES: Record<string, string[]> = {
  prepaids: ['prepaids', 'prepaidamortization'],
  'fixed-assets': ['fixedassets', 'fixedasset', 'depreciation'],
  payroll: ['payroll', 'payrollaccrual'],
  'debt-interest': ['debtinterest', 'debtaccrual'],
  'deferred-tax': ['deferredtax'],
  leases: ['leases', 'lease'],
  inventory: ['inventory', 'inventoryreserve'],
  'stock-comp': ['stockcomp', 'stockcompensation'],
  impairment: ['impairment'],
  'ap-aging': ['apaging'],
  'ar-cecl': ['araging', 'arcecl'],
  segments: ['segments', 'segment'],
  revenue: ['revenue', 'revenuerecognition'],
};

export function normalizeAccountingModuleToken(value: string | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getAccountingModuleAliases(moduleId: string): string[] {
  return MODULE_ALIASES[moduleId] ?? [normalizeAccountingModuleToken(moduleId)];
}

export function matchesAccountingModule(moduleId: string, ...values: Array<string | undefined>): boolean {
  const text = values.map(normalizeAccountingModuleToken).join(' ');
  return getAccountingModuleAliases(moduleId).some((alias) => text.includes(alias));
}

const US_GAAP: Record<string, ModuleFrameworkCopy> = {
  prepaids: { name: 'Prepaids & Deferrals', guidance: 'ASC 340', fullGuidance: 'ASC 340-10', description: 'Amortizes prepaid expenses over approved benefit periods.', method: 'Approved amortization schedule' },
  'fixed-assets': { name: 'Fixed Assets & Depreciation', guidance: 'ASC 360', fullGuidance: 'ASC 360-10', description: 'Rolls forward capital assets and depreciation using the approved register.', method: 'Entity depreciation policy' },
  payroll: { name: 'Payroll Accruals', guidance: 'ASC 710', fullGuidance: 'ASC 710-10', description: 'Accrues unpaid wages, benefits, and employer taxes through period end.', method: 'Payroll subledger and approved accrual policy' },
  'debt-interest': { name: 'Debt & Interest Accrual', guidance: 'ASC 835', fullGuidance: 'ASC 835-30', description: 'Reconciles debt and calculates interest from approved instrument terms.', method: 'Effective interest or contractual terms' },
  'deferred-tax': { name: 'Income Tax Provision', guidance: 'ASC 740', fullGuidance: 'ASC 740-10', description: 'Reviews current and deferred income-tax balances.', method: 'Balance-sheet approach with tax review' },
  leases: { name: 'Lease Accounting', guidance: 'ASC 842', fullGuidance: 'ASC 842-20', description: 'Reconciles lease balances under the configured lease classification.', method: 'Approved lease register' },
  inventory: { name: 'Inventory Reserves', guidance: 'ASC 330', fullGuidance: 'ASC 330-10', description: 'Reviews count, cutoff, costing, and inventory valuation allowances.', method: 'Cost and realizability review' },
  'stock-comp': { name: 'Stock Compensation', guidance: 'ASC 718', fullGuidance: 'ASC 718-10', description: 'Rolls forward awards and recognized compensation from approved valuations.', method: 'Approved valuation and vesting schedule' },
  impairment: { name: 'Impairment Testing', guidance: 'ASC 350/360', fullGuidance: 'ASC 350-20 / ASC 360-10', description: 'Documents impairment indicators and any required measurement.', method: 'Indicator review plus approved valuation' },
  'ap-aging': { name: 'AP Aging & Accruals', guidance: 'ASC 405', fullGuidance: 'ASC 405-20', description: 'Reconciles payables and searches for unrecorded liabilities.', method: 'Subledger aging and subsequent-invoice review' },
  'ar-cecl': { name: 'AR & CECL Allowance', guidance: 'ASC 326', fullGuidance: 'ASC 326-20', description: 'Reviews receivables and the expected-credit-loss allowance.', method: 'Approved CECL methodology' },
  segments: { name: 'Segment Allocations', guidance: 'ASC 280', fullGuidance: 'ASC 280-10', description: 'Applies approved allocation keys and reporting dimensions.', method: 'Management-approved allocation policy' },
  revenue: { name: 'Revenue Recognition', guidance: 'ASC 606', fullGuidance: 'ASC 606-10', description: 'Reviews contract revenue, performance obligations, and cutoff.', method: 'ASC 606 contract analysis' },
};

const ASPE: Record<string, ModuleFrameworkCopy> = {
  prepaids: { name: 'Prepaids & Deferrals', guidance: 'ASPE 1000', fullGuidance: 'ASPE Section 1000 and approved entity policy', description: 'Reconciles prepaid balances and applies the approved benefit-period schedule.', method: 'Approved amortization schedule; no inferred useful life' },
  'fixed-assets': { name: 'Fixed Assets & Amortization', guidance: 'ASPE 3061', fullGuidance: 'ASPE Section 3061 — Property, Plant and Equipment', description: 'Rolls forward property, plant and equipment using the approved asset register.', method: 'Approved useful lives, residual values, and amortization methods' },
  payroll: { name: 'Payroll & Remittance Accruals', guidance: 'ASPE 1000', fullGuidance: 'ASPE Section 1000 and contractual/statutory obligations', description: 'Reconciles wages, benefits, CPP, EI, and source-deduction obligations.', method: 'Payroll register and statutory remittance records' },
  'debt-interest': { name: 'Debt & Interest Reconciliation', guidance: 'ASPE 3856', fullGuidance: 'ASPE Section 3856 — Financial Instruments', description: 'Reconciles debt principal, accrued interest, and lender terms.', method: 'Contractual or effective-interest terms as documented' },
  'deferred-tax': { name: 'Income Tax Provision Review', guidance: 'ASPE 3465', fullGuidance: 'ASPE Section 3465 — Income Taxes', description: 'Reviews current and future income-tax balances and supporting schedules.', method: 'Tax provision prepared from approved tax inputs' },
  leases: { name: 'Lease Reconciliation', guidance: 'ASPE 3065', fullGuidance: 'ASPE Section 3065 — Leases', description: 'Reconciles operating and capital leases under the ASPE risks-and-rewards model.', method: 'Approved lease classification and lease register' },
  inventory: { name: 'Inventory Reconciliation', guidance: 'ASPE 3031', fullGuidance: 'ASPE Section 3031 — Inventories', description: 'Reviews count, cutoff, costing, obsolescence, and net realizable value.', method: 'Approved costing policy and NRV review' },
  'stock-comp': { name: 'Stock-based Compensation', guidance: 'ASPE 3870', fullGuidance: 'ASPE Section 3870 — Stock-based Compensation and Other Stock-based Payments', description: 'Rolls forward awards and recognized compensation from approved valuation inputs.', method: 'Approved valuation and vesting schedule' },
  impairment: { name: 'Asset Impairment Review', guidance: 'ASPE 3063/3064', fullGuidance: 'ASPE Sections 3063 and 3064', description: 'Documents impairment indicators and any required recoverability analysis.', method: 'Indicator review and controller-approved valuation inputs' },
  'ap-aging': { name: 'AP Aging & Unrecorded Liabilities', guidance: 'ASPE 1000/3856', fullGuidance: 'ASPE Sections 1000 and 3856', description: 'Reconciles accounts payable and searches for unrecorded liabilities.', method: 'Vendor aging and subsequent-invoice review' },
  'ar-cecl': { name: 'AR & Impairment Allowance', guidance: 'ASPE 3856', fullGuidance: 'ASPE Section 3856 — Financial Instruments', description: 'Reconciles receivables and reviews impairment using the approved ASPE policy.', method: 'Account-specific and portfolio impairment review; not CECL' },
  segments: { name: 'Management Allocations', guidance: 'Non-GAAP control', fullGuidance: 'Management reporting policy — no ASPE segment standard asserted', description: 'Applies approved internal allocation keys without presenting them as an ASPE requirement.', method: 'Management-approved allocation policy' },
  revenue: { name: 'Revenue Recognition & Cutoff', guidance: 'ASPE 3400', fullGuidance: 'ASPE Section 3400 — Revenue', description: 'Reviews revenue recognition, measurement, presentation, and period cutoff.', method: 'Approved ASPE revenue policy and source documents' },
};

// These retain framework-native labels if a non-Canadian entity uses the same UI.
const IFRS: Record<string, ModuleFrameworkCopy> = {
  ...US_GAAP,
  prepaids: { ...US_GAAP.prepaids!, guidance: 'IAS 1 / policy', fullGuidance: 'IAS 1 and the approved accounting policy applicable to the underlying item', method: 'Approved benefit-period schedule' },
  'fixed-assets': { ...US_GAAP['fixed-assets']!, guidance: 'IAS 16', fullGuidance: 'IAS 16 — Property, Plant and Equipment' },
  payroll: { ...US_GAAP.payroll!, guidance: 'IAS 19', fullGuidance: 'IAS 19 — Employee Benefits' },
  'debt-interest': { ...US_GAAP['debt-interest']!, guidance: 'IFRS 9', fullGuidance: 'IFRS 9 — Financial Instruments' },
  'deferred-tax': { ...US_GAAP['deferred-tax']!, guidance: 'IAS 12', fullGuidance: 'IAS 12 — Income Taxes' },
  leases: { ...US_GAAP.leases!, guidance: 'IFRS 16', fullGuidance: 'IFRS 16 — Leases' },
  inventory: { ...US_GAAP.inventory!, guidance: 'IAS 2', fullGuidance: 'IAS 2 — Inventories' },
  'stock-comp': { ...US_GAAP['stock-comp']!, guidance: 'IFRS 2', fullGuidance: 'IFRS 2 — Share-based Payment' },
  impairment: { ...US_GAAP.impairment!, guidance: 'IAS 36', fullGuidance: 'IAS 36 — Impairment of Assets' },
  'ap-aging': { ...US_GAAP['ap-aging']!, guidance: 'IFRS 9', fullGuidance: 'IFRS 9 — Financial Instruments' },
  'ar-cecl': { ...US_GAAP['ar-cecl']!, name: 'AR & ECL Allowance', guidance: 'IFRS 9', fullGuidance: 'IFRS 9 — Expected Credit Losses', method: 'Approved IFRS 9 ECL methodology' },
  segments: { ...US_GAAP.segments!, guidance: 'IFRS 8', fullGuidance: 'IFRS 8 — Operating Segments' },
  revenue: { ...US_GAAP.revenue!, guidance: 'IFRS 15', fullGuidance: 'IFRS 15 — Revenue from Contracts with Customers', method: 'IFRS 15 contract analysis' },
};

const FRS102: Record<string, ModuleFrameworkCopy> = {
  prepaids: { ...US_GAAP.prepaids!, guidance: 'FRS 102 / policy', fullGuidance: 'FRS 102 and the approved policy applicable to the underlying item' },
  'fixed-assets': { ...US_GAAP['fixed-assets']!, guidance: 'FRS 102 §17', fullGuidance: 'FRS 102 Section 17 — Property, Plant and Equipment' },
  payroll: { ...US_GAAP.payroll!, guidance: 'FRS 102 §28', fullGuidance: 'FRS 102 Section 28 — Employee Benefits' },
  'debt-interest': { ...US_GAAP['debt-interest']!, guidance: 'FRS 102 §11/12', fullGuidance: 'FRS 102 Sections 11 and 12 — Financial Instruments' },
  'deferred-tax': { ...US_GAAP['deferred-tax']!, guidance: 'FRS 102 §29', fullGuidance: 'FRS 102 Section 29 — Income Tax' },
  leases: { ...US_GAAP.leases!, guidance: 'FRS 102 §20', fullGuidance: 'FRS 102 Section 20 — Leases', method: 'Approved lease classification and register' },
  inventory: { ...US_GAAP.inventory!, guidance: 'FRS 102 §13', fullGuidance: 'FRS 102 Section 13 — Inventories' },
  'stock-comp': { ...US_GAAP['stock-comp']!, guidance: 'FRS 102 §26', fullGuidance: 'FRS 102 Section 26 — Share-based Payment' },
  impairment: { ...US_GAAP.impairment!, guidance: 'FRS 102 §27', fullGuidance: 'FRS 102 Section 27 — Impairment of Assets' },
  'ap-aging': { ...US_GAAP['ap-aging']!, guidance: 'FRS 102 §11/12', fullGuidance: 'FRS 102 Sections 11 and 12 — Financial Instruments' },
  'ar-cecl': { ...US_GAAP['ar-cecl']!, name: 'AR & Impairment Allowance', guidance: 'FRS 102 §11', fullGuidance: 'FRS 102 Section 11 — Basic Financial Instruments', method: 'Approved impairment methodology; not CECL' },
  segments: { ...US_GAAP.segments!, name: 'Management Allocations', guidance: 'Management control', fullGuidance: 'Approved management reporting policy; no segment standard is asserted' },
  revenue: { ...US_GAAP.revenue!, guidance: 'FRS 102 §23', fullGuidance: 'FRS 102 Section 23 — Revenue', method: 'FRS 102 revenue analysis' },
};

const FRAMEWORK_COPY: Record<FrontendAccountingStandard, Record<string, ModuleFrameworkCopy>> = {
  ASPE,
  IFRS,
  FRS102,
  US_GAAP,
};

export function normalizeFrontendAccountingStandard(value?: string): FrontendAccountingStandard {
  const normalized = value?.trim().toUpperCase().replace(/[ -]/g, '_');
  if (normalized === 'ASPE') return 'ASPE';
  if (normalized === 'IFRS') return 'IFRS';
  if (normalized === 'FRS102' || normalized === 'FRS_102') return 'FRS102';
  return 'US_GAAP';
}

export function getAccountingModules(standard?: string): AccountingModuleDefinition[] {
  const framework = normalizeFrontendAccountingStandard(standard);
  const copy = FRAMEWORK_COPY[framework];
  return BASES.map((base) => ({ ...base, ...copy[base.id]! }));
}

export function getAccountingModule(moduleId: string, standard?: string): AccountingModuleDefinition | undefined {
  return getAccountingModules(standard).find((module) => module.id === moduleId);
}
