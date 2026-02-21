import type { PortfolioCompany } from '@/lib/types/portfolio';

function mk(
  id: string,
  name: string,
  sector: string,
  revenue: string | null,
  netIncome: string | null,
  state: PortfolioCompany['currentState'],
  sessionId: string,
  daysInClose: number | null,
  targetDays: number,
  gatesP: number,
  gatesT: number,
  blocking: number,
  preparer: string | null,
  reviewer: string | null,
  lastAct: string | null,
  history: (number | null)[],
  marginPct: string | null,
  vsPrior: string | null
): PortfolioCompany {
  const overdue = daysInClose != null && daysInClose > targetDays;
  const needsAttention = overdue || blocking > 0 || (lastAct === '2 days ago' && state === 'IN_PROGRESS');
  let attentionReason: string | null = null;
  if (blocking > 0) attentionReason = 'Blocking issues';
  if (overdue) attentionReason = attentionReason ? 'Overdue, blocking issues' : 'Overdue';
  if (!attentionReason && lastAct === '2 days ago' && state === 'IN_PROGRESS') attentionReason = 'Stalled';
  return {
    id, name, sector, revenue, netIncome, currentPeriod: 'January 2026', currentState: state, currentSessionId: sessionId, daysInClose, targetCloseDays: targetDays, gatesPassing: gatesP, gatesTotal: gatesT, blockingIssues: blocking, preparer, reviewer, lastActivity: lastAct, closeDurationHistory: history, needsAttention, attentionReason, marginPercent: marginPct, marginVsPriorPp: vsPrior,
  };
}

export const mockPortfolioCompanies: PortfolioCompany[] = [
  mk('apex-mfg', 'Apex Manufacturing Co.', 'Manufacturing', '20790000.00', '3405250.00', 'IN_PROGRESS', 'c925645f-3831-4d81-93a9-a12a2819cd3e', 4, 5, 5, 9, 2, 'Sarah Chen', 'Mike Torres', '2 hours ago', [6, 7, 5, 6, 5, 4], '16.4', '1.2'),
  mk('beacon-health', 'Beacon Healthcare Systems', 'Healthcare', '45120000.00', '5870000.00', 'CERTIFIED', 'session-beacon-jan', 5, 5, 9, 9, 0, 'Emily Rodriguez', 'David Park', '1 day ago', [4, 4, 5, 5, 6, 5], '13.0', '-0.8'),
  mk('cascade-energy', 'Cascade Energy Partners', 'Energy', '12300000.00', '1845000.00', 'LOCKED', 'session-cascade-jan', 3, 5, 9, 9, 0, 'Alex Kim', 'Maria Santos', '3 days ago', [5, 5, 4, 4, 3, 3], '15.0', '0.3'),
  mk('summit-logistics', 'Summit Logistics Inc.', 'Logistics', '38900000.00', '2723000.00', 'IN_PROGRESS', 'session-summit-jan', 7, 5, 4, 9, 0, 'James Wilson', 'Patricia Liu', '2 days ago', [5, 6, 7, 6, 7, 7], '7.0', '-0.5'),
  mk('pinnacle-tech', 'Pinnacle Technology Group', 'Technology', '67800000.00', '10170000.00', 'UNDER_REVIEW', 'session-pinnacle-jan', 4, 5, 9, 9, 0, 'Rachel Adams', 'Tom Nakamura', '4 hours ago', [6, 5, 5, 4, 4, 4], '15.0', '0.2'),
  mk('meridian-retail', 'Meridian Retail Holdings', 'Retail', '28500000.00', '1710000.00', 'CERTIFIED', 'session-meridian-jan', 4, 5, 9, 9, 0, 'Chris Morgan', 'Diane Foster', '2 days ago', [7, 6, 5, 5, 4, 4], '6.0', '0.1'),
  mk('ironclad-construction', 'Ironclad Construction', 'Construction', '15600000.00', '936000.00', 'IN_PROGRESS', 'session-ironclad-jan', 3, 6, 6, 9, 1, 'Nathan Brooks', 'Laura Chen', '5 hours ago', [8, 7, 7, 6, 6, null], '6.0', '-0.2'),
  mk('coastal-hospitality', 'Coastal Hospitality Group', 'Hospitality', '22100000.00', '2652000.00', 'LOCKED', 'session-coastal-jan', 4, 5, 9, 9, 0, 'Sophia Martinez', 'Kevin Patel', '5 days ago', [5, 5, 4, 4, 4, 4], '12.0', '0.4'),
  mk('frontier-agriculture', 'Frontier Agriculture Corp', 'Agriculture', '19200000.00', '1536000.00', 'CERTIFIED', 'session-frontier-jan', 5, 5, 9, 9, 0, 'Tyler Dawson', 'Angela Wright', '1 day ago', [6, 6, 5, 5, 5, 5], '8.0', '0.0'),
  mk('nova-pharmaceuticals', 'Nova Pharmaceuticals', 'Pharmaceuticals', '54300000.00', '8688000.00', 'LOCKED', 'session-nova-jan', 3, 4, 9, 9, 0, 'Hannah Lee', 'Robert Quinn', '4 days ago', [5, 4, 4, 3, 3, 3], '16.0', '0.5'),
  mk('atlas-media', 'Atlas Media & Entertainment', 'Media', null, null, 'OPEN', 'session-atlas-jan', null, 5, 0, 9, 0, null, null, null, [6, 7, 6, 7, 6, null], null, null),
  mk('redwood-financial', 'Redwood Financial Services', 'Financial Services', '31800000.00', '5724000.00', 'CERTIFIED', 'session-redwood-jan', 4, 5, 9, 9, 0, 'Jessica Hernandez', 'Mark Thompson', '2 days ago', [5, 5, 4, 4, 4, 4], '18.0', '0.3'),
];

export function getPortfolioCompanies(_period?: string): PortfolioCompany[] {
  return mockPortfolioCompanies;
}
