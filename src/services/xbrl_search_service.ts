/**
 * XBRL Search Service — search the full US GAAP taxonomy by text similarity.
 * Uses trigram (pg_trgm) text similarity as primary search method.
 * Embedding-based search is used when embeddings are available (vector(384) column).
 */

import type { Pool } from 'pg';
import { log } from '../lib/logger.js';

export interface XBRLSearchResult {
  id: string;
  elementName: string;
  label: string;
  documentation: string | null;
  balanceType: string;
  periodType: string;
  statement: string;
  similarity: number;
  matchMethod: 'trigram' | 'embedding' | 'both';
}

export interface XBRLSearchOptions {
  accountType?: string;
  balanceDirection?: 'debit' | 'credit';
  statement?: string;
  limit?: number;
}

export interface XBRLStats {
  total: number;
  byStatement: Record<string, number>;
  abstract: number;
  deprecated: number;
  withEmbeddings: number;
}

/**
 * Search XBRL taxonomy elements by text query.
 * Uses trigram similarity (pg_trgm) for fuzzy text matching.
 * Boosts score when balance_type or statement matches the provided filters.
 */
export async function searchXBRL(
  pool: Pool,
  query: string,
  options?: XBRLSearchOptions
): Promise<XBRLSearchResult[]> {
  const limit = options?.limit ?? 10;
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Build WHERE clauses for optional filters
  const conditions: string[] = ['abstract = false', 'deprecated = false'];
  const params: unknown[] = [trimmed];
  let paramIdx = 2;

  if (options?.statement) {
    conditions.push(`statement = $${paramIdx}`);
    params.push(options.statement);
    paramIdx++;
  }

  if (options?.balanceDirection) {
    conditions.push(`balance_type = $${paramIdx}`);
    params.push(options.balanceDirection);
    paramIdx++;
  }

  params.push(limit * 2); // fetch extra for re-ranking
  const limitParam = `$${paramIdx}`;

  const whereClause = conditions.join(' AND ');

  // Method 1: Trigram text similarity on label
  const trigramSql = `
    SELECT id, element_name, label, documentation, balance_type, period_type, statement,
           GREATEST(
             similarity(label, $1),
             similarity(element_name, $1)
           ) AS sim
    FROM xbrl_taxonomy_elements
    WHERE ${whereClause}
      AND (similarity(label, $1) > 0.1 OR similarity(element_name, $1) > 0.1)
    ORDER BY sim DESC
    LIMIT ${limitParam}
  `;

  const trigramRes = await pool.query<{
    id: string;
    element_name: string;
    label: string;
    documentation: string | null;
    balance_type: string;
    period_type: string;
    statement: string;
    sim: number;
  }>(trigramSql, params);

  // Merge and score-boost
  const resultMap = new Map<string, XBRLSearchResult>();
  for (const row of trigramRes.rows) {
    let score = Number(row.sim);

    // Boost for balance_type match (when provided as hint but not as filter)
    if (options?.balanceDirection && !options.statement && row.balance_type === options.balanceDirection) {
      score += 0.05;
    }

    resultMap.set(row.id, {
      id: row.id,
      elementName: row.element_name,
      label: row.label,
      documentation: row.documentation,
      balanceType: row.balance_type,
      periodType: row.period_type,
      statement: row.statement,
      similarity: Math.min(score, 1.0),
      matchMethod: 'trigram',
    });
  }

  // Sort by similarity descending, return top N
  const sorted = Array.from(resultMap.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return sorted;
}

/**
 * Get aggregate statistics about the XBRL taxonomy in the database.
 */
export async function getXBRLStats(pool: Pool): Promise<XBRLStats> {
  const totalRes = await pool.query<{ cnt: string }>('SELECT COUNT(*) AS cnt FROM xbrl_taxonomy_elements');
  const stmtRes = await pool.query<{ statement: string; cnt: string }>(
    'SELECT statement, COUNT(*) AS cnt FROM xbrl_taxonomy_elements GROUP BY statement ORDER BY statement'
  );
  const abstractRes = await pool.query<{ cnt: string }>(
    'SELECT COUNT(*) AS cnt FROM xbrl_taxonomy_elements WHERE abstract = true'
  );
  const deprecatedRes = await pool.query<{ cnt: string }>(
    'SELECT COUNT(*) AS cnt FROM xbrl_taxonomy_elements WHERE deprecated = true'
  );
  const embeddingRes = await pool.query<{ cnt: string }>(
    'SELECT COUNT(*) AS cnt FROM xbrl_taxonomy_elements WHERE embedding IS NOT NULL'
  );

  const byStatement: Record<string, number> = {};
  for (const row of stmtRes.rows) {
    byStatement[row.statement] = Number(row.cnt);
  }

  return {
    total: Number(totalRes.rows[0].cnt),
    byStatement,
    abstract: Number(abstractRes.rows[0].cnt),
    deprecated: Number(deprecatedRes.rows[0].cnt),
    withEmbeddings: Number(embeddingRes.rows[0].cnt),
  };
}

/**
 * Look up a single XBRL element by ID.
 */
export async function getXBRLElement(pool: Pool, id: string): Promise<XBRLSearchResult | null> {
  const res = await pool.query<{
    id: string;
    element_name: string;
    label: string;
    documentation: string | null;
    balance_type: string;
    period_type: string;
    statement: string;
  }>(
    `SELECT id, element_name, label, documentation, balance_type, period_type, statement
     FROM xbrl_taxonomy_elements
     WHERE id = $1`,
    [id]
  );

  if (res.rows.length === 0) return null;

  const row = res.rows[0];
  return {
    id: row.id,
    elementName: row.element_name,
    label: row.label,
    documentation: row.documentation,
    balanceType: row.balance_type,
    periodType: row.period_type,
    statement: row.statement,
    similarity: 1.0,
    matchMethod: 'trigram',
  };
}
