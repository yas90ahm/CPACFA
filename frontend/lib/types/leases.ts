export interface Lease {
  id: string;
  entityId: string;
  leaseName: string;
  leaseType: 'finance' | 'operating';
  commencementDate: string;
  termMonths: number;
  monthlyPayment: string;
  ibrAnnual: string;
  rouAssetInitial: string;
  leaseLiabilityInitial: string;
  assetAccount: string;
  liabilityAccount: string;
  expenseAccount: string;
  interestAccount: string;
  amortizationAccount: string;
  accumAmortizationAccount: string;
  status: 'active' | 'expired' | 'terminated' | 'modified';
  createdAt: string;
  updatedAt: string;
}

export interface PaymentScheduleRow {
  id: string;
  leaseId: string;
  periodNumber: number;
  paymentDate: string;
  paymentAmount: string;
  interestAmount: string;
  principalAmount: string;
  beginningLiability: string;
  endingLiability: string;
  rouAmortization: string;
  straightLineExpense: string;
}

export interface PeriodEntry {
  id: string;
  leaseId: string;
  closeSessionId: string;
  scheduleId: string;
  journalEntryId: string | null;
  entryType: 'interest' | 'amortization' | 'operating_expense';
  amount: string;
  createdAt: string;
}

export interface LeaseDisclosure {
  maturityAnalysis: { year: number; totalPayments: string }[];
  weightedAverageRemainingTerm: string;
  weightedAverageDiscountRate: string;
  financeLeaseExpense: { interest: string; amortization: string; total: string };
  operatingLeaseExpense: string;
  totalLeaseCount: number;
  financeLeaseCount: number;
  operatingLeaseCount: number;
}
