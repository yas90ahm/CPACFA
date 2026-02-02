/**
 * RAG: In-memory store of FASB and IFRS handbook chunks.
 * Agent uses this to cite specific sections. Replace with real vector DB (e.g. Pinecone, Chroma) for production.
 */

import type { HandbookChunk, RAGResult } from '../types/justification.js';

const HANDBOOK_CHUNKS: HandbookChunk[] = [
  {
    id: 'asc-350-40-25',
    framework: 'FASB',
    citation: 'ASC 350-40-25-2',
    section: 'Internal-Use Software—Capitalization',
    text: 'Costs incurred in the preliminary project stage and the post-implementation stage shall be expensed as incurred. Costs incurred in the application development stage shall be capitalized.',
  },
  {
    id: 'asc-350-40-25-3',
    framework: 'FASB',
    citation: 'ASC 350-40-25-3',
    section: 'Internal-Use Software',
    text: 'Capitalization begins when both of the following conditions are met: (a) the conceptual formulation, design, and testing of possible software project alternatives are completed and (b) management authorizes and commits to funding the computer software project.',
  },
  {
    id: 'asc-606-10-25-1',
    framework: 'FASB',
    citation: 'ASC 606-10-25-1',
    section: 'Revenue from Contracts with Customers',
    text: 'An entity shall recognize revenue when (or as) the entity satisfies a performance obligation by transferring a promised good or service to a customer. A good or service is transferred when (or as) the customer obtains control of that good or service.',
  },
  {
    id: 'asc-606-10-25-2',
    framework: 'FASB',
    citation: 'ASC 606-10-25-2',
    section: 'Revenue—Performance Obligations',
    text: 'A performance obligation is a promise in a contract to transfer a good or service to a customer. At contract inception, an entity shall identify the performance obligations in the contract.',
  },
  {
    id: 'asc-210-10-45',
    framework: 'FASB',
    citation: 'ASC 210-10-45',
    section: 'Balance Sheet—Overall',
    text: 'A balance sheet shall present assets, liabilities, and equity. Assets shall equal liabilities plus equity.',
  },
  {
    id: 'asc-220-10-45',
    framework: 'FASB',
    citation: 'ASC 220-10-45',
    section: 'Comprehensive Income',
    text: 'An income statement shall present revenue, expenses, gains, losses, and net income. Net income reflects revenue minus expenses from ongoing operations.',
  },
  {
    id: 'asc-360-10-35',
    framework: 'FASB',
    citation: 'ASC 360-10-35-4',
    section: 'Property, Plant, and Equipment—Depreciation',
    text: 'Depreciation is the systematic allocation of the cost of an asset over its useful life. Acceptable methods include straight-line, declining balance, and units-of-production.',
  },
  {
    id: 'asc-842-20-25',
    framework: 'FASB',
    citation: 'ASC 842-20-25-1',
    section: 'Leases—Lessee Recognition',
    text: 'At the commencement date, a lessee shall recognize a right-of-use asset and a lease liability. The lease liability shall be measured at the present value of the lease payments.',
  },
  {
    id: 'ias-1-54',
    framework: 'IFRS',
    citation: 'IAS 1.54',
    section: 'Presentation of Financial Statements',
    text: 'An entity shall present current and non-current assets, and current and non-current liabilities, as separate classifications in the balance sheet, except when a liquidity presentation provides more relevant information.',
  },
  {
    id: 'ias-1-81',
    framework: 'IFRS',
    citation: 'IAS 1.81',
    section: 'Income Statement',
    text: 'The income statement shall present, as minimum line items, revenue, finance costs, share of profit or loss of associates, profit or loss, and other comprehensive income.',
  },
  {
    id: 'ias-38-57',
    framework: 'IFRS',
    citation: 'IAS 38.57',
    section: 'Intangible Assets',
    text: 'An intangible asset shall be recognised if, and only if, it is probable that the expected future economic benefits that are attributable to the asset will flow to the entity and the cost of the asset can be measured reliably.',
  },
];

/** Simple keyword/section search (no embeddings). Replace with vector similarity for production. */
function scoreChunk(chunk: HandbookChunk, query: string): number {
  const q = query.toLowerCase();
  const text = (chunk.text + ' ' + (chunk.section ?? '') + ' ' + chunk.citation).toLowerCase();
  let score = 0;
  const terms = q.split(/\s+/).filter((t) => t.length > 2);
  for (const t of terms) {
    if (text.includes(t)) score += 1;
    if (chunk.citation.toLowerCase().includes(t)) score += 2;
  }
  return score;
}

export class InMemoryHandbookStore {
  private chunks: HandbookChunk[] = [...HANDBOOK_CHUNKS];

  async query(
    query: string,
    options?: { topK?: number; framework?: 'FASB' | 'IFRS' }
  ): Promise<RAGResult> {
    const topK = options?.topK ?? 5;
    let list = this.chunks;
    if (options?.framework) {
      list = list.filter((c) => c.framework === options.framework);
    }
    const scored = list
      .map((c) => ({ chunk: c, score: scoreChunk(c, query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((x) => x.chunk);
    if (scored.length === 0) {
      scored.push(this.chunks.find((c) => c.framework === 'FASB') ?? this.chunks[0]);
    }
    return { chunks: scored, query };
  }
}

let defaultStore: InMemoryHandbookStore | null = null;

export function getDefaultRAGStore(): InMemoryHandbookStore {
  if (!defaultStore) defaultStore = new InMemoryHandbookStore();
  return defaultStore;
}

/** Return all handbook chunks (e.g. for Financial Memory Tier 1 Global). */
export function getHandbookChunks(): HandbookChunk[] {
  return [...HANDBOOK_CHUNKS];
}
