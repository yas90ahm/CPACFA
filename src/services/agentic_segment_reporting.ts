/**
 * Agentic segment reporting: segment identification, allocation, footnote generation.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { SegmentReportingResult } from './segment_reporting_service.js';

// ============================================================================
// Segment Identification Agent
// ============================================================================

export interface SuggestedSegment {
  name: string;
  description: string;
  basis: string; // how CODM reviews this segment
  rationale: string;
}

/**
 * Suggests operating segments from CODM reports and business description.
 */
export async function suggestSegmentsAgentic(
  codmReports: string,
  businessDescription: string
): Promise<{ suggestedSegments: SuggestedSegment[]; rationale: string }> {
  const systemPrompt = `You are a segment reporting specialist. Given information about how the chief operating decision maker (CODM) reviews the business, identify operating segments under IFRS 8 / ASC 280.

Key principles:
- Operating segments are components about which discrete financial info is available
- CODM regularly reviews segment results for resource allocation and performance assessment
- Consider management approach, not products or geographies per se
- Aggregation is permitted if similar economic characteristics

Return JSON: { "suggestedSegments": [{ "name": "...", "description": "...", "basis": "how CODM reviews", "rationale": "..." }], "rationale": "..." }`;

  const userContent = `CODM Reports:\n${codmReports.slice(0, 3000)}\n\nBusiness Description:\n${businessDescription.slice(0, 2000)}`;

  const fallback = { suggestedSegments: [] as SuggestedSegment[], rationale: 'Unable to identify segments' };

  return callLLMWithFallback({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 1000,
    parse: (raw: string) => {
      const parsed = JSON.parse(raw);
      return {
        suggestedSegments: parsed.suggestedSegments ?? [],
        rationale: parsed.rationale ?? 'Segments identified',
      };
    },
    fallback,
  });
}

// ============================================================================
// Cost Allocation Agent
// ============================================================================

export interface AllocationResult {
  segmentId: string;
  segmentName: string;
  allocatedAmount: number;
  allocationPercent: number;
}

export interface AllocationRecommendation {
  allocationBySegment: AllocationResult[];
  methodology: string;
  rationale: string;
}

/**
 * Suggests allocation of shared costs/assets to segments.
 */
export async function suggestAllocationAgentic(
  sharedCosts: number,
  allocationBasis: 'revenue' | 'headcount' | 'assets' | 'custom',
  segmentMetrics: Array<{ segmentId: string; segmentName: string; metric: number }>
): Promise<AllocationRecommendation> {
  const systemPrompt = `You are a management accounting specialist. Allocate shared costs to operating segments using appropriate methodology.

Common allocation bases:
- Revenue: For revenue-correlated costs (sales, marketing)
- Headcount: For people-related costs (HR, facilities)
- Assets: For asset-intensive costs (depreciation, maintenance)
- Direct trace: When direct relationship exists

Allocation should be systematic, rational, and consistently applied.

Return JSON: { "allocationBySegment": [{ "segmentId": "...", "segmentName": "...", "allocatedAmount": X, "allocationPercent": X }], "methodology": "...", "rationale": "..." }`;

  const totalMetric = segmentMetrics.reduce((sum, s) => sum + s.metric, 0);
  const userContent = `Shared Costs: $${sharedCosts.toLocaleString()}\nAllocation Basis: ${allocationBasis}\nSegment Metrics:\n${JSON.stringify(segmentMetrics)}`;

  // Calculate default allocation
  const defaultAllocation: AllocationResult[] = segmentMetrics.map((s) => ({
    segmentId: s.segmentId,
    segmentName: s.segmentName,
    allocationPercent: totalMetric > 0 ? (s.metric / totalMetric) * 100 : 0,
    allocatedAmount: totalMetric > 0 ? sharedCosts * (s.metric / totalMetric) : 0,
  }));

  const fallback: AllocationRecommendation = {
    allocationBySegment: defaultAllocation,
    methodology: `Pro-rata based on ${allocationBasis}`,
    rationale: 'Standard allocation applied',
  };

  return callLLMWithFallback<AllocationRecommendation>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 800,
    parse: (raw: string): AllocationRecommendation => {
      const parsed = JSON.parse(raw);
      return {
        allocationBySegment: parsed.allocationBySegment ?? defaultAllocation,
        methodology: parsed.methodology ?? fallback.methodology,
        rationale: parsed.rationale ?? 'Allocation complete',
      };
    },
    fallback,
  });
}

// ============================================================================
// Reconciliation Agent
// ============================================================================

export interface ReconciliationSuggestion {
  itemType: 'revenue' | 'profit' | 'assets';
  suggestedItems: Array<{ description: string; amount: number }>;
  explanation: string;
}

/**
 * Suggests reconciling items between segment totals and consolidated totals.
 */
export async function suggestReconcilingItemsAgentic(
  segmentTotal: number,
  consolidatedTotal: number,
  itemType: 'revenue' | 'profit' | 'assets'
): Promise<ReconciliationSuggestion> {
  const difference = consolidatedTotal - segmentTotal;

  const systemPrompt = `You are a segment reporting specialist. Suggest reconciling items between segment totals and consolidated totals.

Common reconciling items:
Revenue: Intersegment eliminations, unallocated revenue
Profit: Corporate expenses, intersegment profit elimination, unallocated items
Assets: Intersegment investments, corporate assets, eliminations

Return JSON: { "itemType": "...", "suggestedItems": [{ "description": "...", "amount": X }], "explanation": "..." }`;

  const userContent = `Item Type: ${itemType}\nSegment Total: $${segmentTotal.toLocaleString()}\nConsolidated Total: $${consolidatedTotal.toLocaleString()}\nDifference: $${difference.toLocaleString()}`;

  const fallback: ReconciliationSuggestion = {
    itemType,
    suggestedItems: difference !== 0 ? [{ description: 'Unallocated/eliminations', amount: difference }] : [],
    explanation: 'Reconciliation pending review',
  };

  return callLLMWithFallback<ReconciliationSuggestion>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 600,
    parse: (raw: string): ReconciliationSuggestion => {
      const parsed = JSON.parse(raw);
      return {
        itemType: parsed.itemType ?? itemType,
        suggestedItems: parsed.suggestedItems ?? fallback.suggestedItems,
        explanation: parsed.explanation ?? 'Reconciliation items identified',
      };
    },
    fallback,
  });
}

// ============================================================================
// Segment Footnote Agent
// ============================================================================

export interface SegmentFootnote {
  summary: string;
  basisOfSegmentation: string;
  segmentDescription: string;
  segmentResults: string;
  reconciliationDisclosure: string;
  geographicDisclosure: string;
  majorCustomerDisclosure: string;
}

/**
 * Generates segment reporting footnote disclosure.
 */
export async function generateSegmentFootnoteAgentic(
  segmentReport: SegmentReportingResult
): Promise<SegmentFootnote> {
  const systemPrompt = `You are a financial reporting expert. Generate a segment reporting footnote disclosure following IFRS 8 / ASC 280 requirements.

Include:
1. Summary of operating segments
2. Basis of segmentation (management approach)
3. Description of each segment
4. Segment results table reference
5. Reconciliation of segment totals to consolidated
6. Geographic information (if material)
7. Major customer disclosure (if >10% of revenue)

Use professional financial statement language. Return JSON: { "summary": "...", "basisOfSegmentation": "...", "segmentDescription": "...", "segmentResults": "...", "reconciliationDisclosure": "...", "geographicDisclosure": "...", "majorCustomerDisclosure": "..." }`;

  const userContent = JSON.stringify(segmentReport, null, 2);

  const fallback: SegmentFootnote = {
    summary: 'Segment footnote pending review.',
    basisOfSegmentation: '',
    segmentDescription: '',
    segmentResults: '',
    reconciliationDisclosure: '',
    geographicDisclosure: '',
    majorCustomerDisclosure: '',
  };

  return callLLMWithFallback<SegmentFootnote>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 1500,
    parse: (raw: string): SegmentFootnote => {
      const parsed = JSON.parse(raw);
      return {
        summary: parsed.summary ?? '',
        basisOfSegmentation: parsed.basisOfSegmentation ?? '',
        segmentDescription: parsed.segmentDescription ?? '',
        segmentResults: parsed.segmentResults ?? '',
        reconciliationDisclosure: parsed.reconciliationDisclosure ?? '',
        geographicDisclosure: parsed.geographicDisclosure ?? '',
        majorCustomerDisclosure: parsed.majorCustomerDisclosure ?? '',
      };
    },
    fallback,
  });
}
