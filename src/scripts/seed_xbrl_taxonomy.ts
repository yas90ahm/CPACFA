/**
 * Seed xbrl_taxonomy_elements table from parsed taxonomy JSON.
 * Reads data/xbrl_parsed_taxonomy.json, batch-inserts into xbrl_taxonomy_elements.
 * Run: npx tsx src/scripts/seed_xbrl_taxonomy.ts
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { getPool, isDbConfigured } from '../db/index.js';

interface ParsedElement {
  id: string;
  element_name: string;
  label: string;
  documentation: string | null;
  balance_type: 'debit' | 'credit' | 'na';
  period_type: 'instant' | 'duration' | 'na';
  abstract: boolean;
  deprecated: boolean;
  statement: string;
}

const CHUNK_SIZE = 500;
const JSON_PATH = path.join(__dirname, '../../data/xbrl_parsed_taxonomy.json');

async function seedXbrlTaxonomy(): Promise<void> {
  if (!isDbConfigured()) {
    console.error('[seed_xbrl] DATABASE_URL not set; cannot seed.');
    process.exit(1);
  }

  if (!fs.existsSync(JSON_PATH)) {
    console.error(`[seed_xbrl] Parsed taxonomy not found at ${JSON_PATH}. Run parse_xbrl_taxonomy.ts first.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(JSON_PATH, 'utf-8');
  const elements: ParsedElement[] = JSON.parse(raw);
  console.log(`[seed_xbrl] Loaded ${elements.length} elements from ${JSON_PATH}`);

  const pool = getPool();

  let inserted = 0;
  for (let offset = 0; offset < elements.length; offset += CHUNK_SIZE) {
    const chunk = elements.slice(offset, offset + CHUNK_SIZE);

    // Build parameterized INSERT with ON CONFLICT DO UPDATE
    const values: unknown[] = [];
    const rows: string[] = [];
    for (let i = 0; i < chunk.length; i++) {
      const el = chunk[i];
      const base = i * 9;
      rows.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`);
      values.push(
        el.id,
        el.element_name,
        el.label,
        el.documentation,
        el.balance_type,
        el.period_type,
        el.abstract,
        el.statement,
        el.deprecated
      );
    }

    const sql = `
      INSERT INTO xbrl_taxonomy_elements (id, element_name, label, documentation, balance_type, period_type, abstract, statement, deprecated)
      VALUES ${rows.join(',\n')}
      ON CONFLICT (id) DO UPDATE SET
        element_name = EXCLUDED.element_name,
        label = EXCLUDED.label,
        documentation = EXCLUDED.documentation,
        balance_type = EXCLUDED.balance_type,
        period_type = EXCLUDED.period_type,
        abstract = EXCLUDED.abstract,
        statement = EXCLUDED.statement,
        deprecated = EXCLUDED.deprecated
    `;

    await pool.query(sql, values);
    inserted += chunk.length;
    console.log(`[seed_xbrl] Inserted ${inserted} / ${elements.length} (chunk ${Math.floor(offset / CHUNK_SIZE) + 1})`);
  }

  // Final counts
  const totalRes = await pool.query('SELECT COUNT(*) AS cnt FROM xbrl_taxonomy_elements');
  const stmtRes = await pool.query('SELECT statement, COUNT(*) AS cnt FROM xbrl_taxonomy_elements GROUP BY statement ORDER BY statement');
  const abstractRes = await pool.query('SELECT COUNT(*) AS cnt FROM xbrl_taxonomy_elements WHERE abstract = true');
  const deprecatedRes = await pool.query('SELECT COUNT(*) AS cnt FROM xbrl_taxonomy_elements WHERE deprecated = true');

  console.log(`\n[seed_xbrl] Final counts:`);
  console.log(`  Total: ${totalRes.rows[0].cnt}`);
  for (const row of stmtRes.rows) {
    console.log(`  ${row.statement}: ${row.cnt}`);
  }
  console.log(`  Abstract: ${abstractRes.rows[0].cnt}`);
  console.log(`  Deprecated: ${deprecatedRes.rows[0].cnt}`);
  console.log('\n[seed_xbrl] Seed complete.');

  // Compute embeddings for semantic search (if embedding provider is configured)
  try {
    const { computeXbrlEmbeddings } = await import('../services/xbrl_embedding_service.js');
    console.log('\n[seed_xbrl] Computing embeddings for semantic search...');
    const embeddingCount = await computeXbrlEmbeddings(pool);
    console.log(`[seed_xbrl] Embeddings computed: ${embeddingCount}`);
  } catch (err) {
    console.warn('[seed_xbrl] Embedding computation skipped:', err instanceof Error ? err.message : String(err));
  }
}

const isMain = process.argv[1]?.includes('seed_xbrl_taxonomy');
if (isMain) {
  seedXbrlTaxonomy().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { seedXbrlTaxonomy };
