/**
 * Map Sabit FS taxonomy lines (fs_taxonomy_lines) to XBRL taxonomy elements.
 * Uses hardcoded mappings for well-known lines, and trigram search for the rest.
 * Run: npx tsx src/scripts/map_sabit_to_xbrl.ts
 */

import 'dotenv/config';
import { getPool, isDbConfigured } from '../db/index.js';
import { searchXBRL, type XBRLSearchResult } from '../services/xbrl_search_service.js';

/** Well-known Sabit taxonomy line -> XBRL element mappings. */
const KNOWN_MAPPINGS: Record<string, string> = {
  // Income Statement
  'fs_revenue': 'us-gaap:Revenues',
  'fs_revenue_product': 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',
  'fs_revenue_service': 'us-gaap:ServiceRevenue',
  'fs_revenue_other': 'us-gaap:OtherIncome',
  'fs_revenue_contra': 'us-gaap:SalesReturnsAndAllowances',
  'fs_cogs': 'us-gaap:CostOfGoodsAndServicesSold',
  'fs_cogs_materials': 'us-gaap:CostOfGoodsSoldDirectMaterials',
  'fs_cogs_labor': 'us-gaap:CostOfGoodsSoldDirectLabor',
  'fs_cogs_overhead': 'us-gaap:CostOfGoodsSoldOverhead',
  'fs_opex_sga': 'us-gaap:SellingGeneralAndAdministrativeExpense',
  'fs_opex_rd': 'us-gaap:ResearchAndDevelopmentExpense',
  'fs_opex_da': 'us-gaap:DepreciationDepletionAndAmortization',
  'fs_opex_other': 'us-gaap:OtherOperatingIncomeExpenseNet',
  'fs_interest_income': 'us-gaap:InterestIncomeExpenseNet',
  'fs_interest_expense': 'us-gaap:InterestExpense',
  'fs_other_income': 'us-gaap:NonoperatingIncomeExpense',
  'fs_other_gain_loss': 'us-gaap:GainLossOnDispositionOfAssets',
  'fs_tax_expense': 'us-gaap:IncomeTaxExpenseBenefit',
  'fs_tax_current': 'us-gaap:CurrentIncomeTaxExpenseBenefit',
  'fs_tax_deferred': 'us-gaap:DeferredIncomeTaxExpenseBenefit',

  // Balance Sheet - Assets
  'fs_asset_cash': 'us-gaap:CashAndCashEquivalentsAtCarryingValue',
  'fs_asset_ar': 'us-gaap:AccountsReceivableNetCurrent',
  'fs_asset_ar_allowance': 'us-gaap:AllowanceForDoubtfulAccountsReceivableCurrent',
  'fs_asset_inventory': 'us-gaap:InventoryNet',
  'fs_asset_prepaid': 'us-gaap:PrepaidExpenseCurrent',
  'fs_asset_other_current': 'us-gaap:OtherAssetsCurrent',
  'fs_asset_ppe': 'us-gaap:PropertyPlantAndEquipmentGross',
  'fs_asset_ppe_accum_dep': 'us-gaap:AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment',
  'fs_asset_intangible': 'us-gaap:IntangibleAssetsNetExcludingGoodwill',
  'fs_asset_intangible_amort': 'us-gaap:AccumulatedAmortizationOfIntangibleAssets',
  'fs_asset_goodwill': 'us-gaap:Goodwill',
  'fs_asset_dta': 'us-gaap:DeferredIncomeTaxAssetsNet',

  // Balance Sheet - Liabilities
  'fs_liability_ap': 'us-gaap:AccountsPayableCurrent',
  'fs_liability_accrued': 'us-gaap:AccruedLiabilitiesCurrent',
  'fs_liability_current_debt': 'us-gaap:ShortTermBorrowings',
  'fs_liability_deferred_rev_current': 'us-gaap:ContractWithCustomerLiabilityCurrent',
  'fs_liability_other_current': 'us-gaap:OtherLiabilitiesCurrent',
  'fs_liability_lt_debt': 'us-gaap:LongTermDebtNoncurrent',
  'fs_liability_deferred_rev_noncurrent': 'us-gaap:ContractWithCustomerLiabilityNoncurrent',
  'fs_liability_dtl': 'us-gaap:DeferredIncomeTaxLiabilitiesNet',
  'fs_liability_other_noncurrent': 'us-gaap:OtherLiabilitiesNoncurrent',

  // Equity
  'fs_equity': 'us-gaap:StockholdersEquity',
  'fs_equity_common': 'us-gaap:CommonStockValue',
  'fs_equity_apic': 'us-gaap:AdditionalPaidInCapital',
  'fs_equity_retained': 'us-gaap:RetainedEarningsAccumulatedDeficit',
  'fs_equity_treasury': 'us-gaap:TreasuryStockValue',
  'fs_equity_aoci': 'us-gaap:AccumulatedOtherComprehensiveIncomeLossNetOfTax',
  'fs_equity_dividends': 'us-gaap:Dividends',
};

const MIN_SIMILARITY = 0.5;

interface TaxonomyLine {
  id: string;
  name: string;
  statement: string;
  normal_balance: string;
}

interface MappingResult {
  sabit_id: string;
  sabit_name: string;
  xbrl_element_id: string | null;
  xbrl_label: string | null;
  source: 'hardcoded' | 'search' | 'none';
  similarity: number | null;
}

async function mapSabitToXbrl(): Promise<void> {
  if (!isDbConfigured()) {
    console.error('[map_sabit] DATABASE_URL not set; cannot map.');
    process.exit(1);
  }

  const pool = getPool();

  // Fetch all Sabit taxonomy lines
  const linesRes = await pool.query<TaxonomyLine>(
    'SELECT id, name, statement, normal_balance FROM fs_taxonomy_lines ORDER BY statement, id'
  );
  const lines = linesRes.rows;
  console.log(`[map_sabit] Found ${lines.length} Sabit taxonomy lines`);

  const results: MappingResult[] = [];
  let hardcoded = 0;
  let searched = 0;
  let unmatched = 0;

  for (const line of lines) {
    // Check hardcoded mapping first
    if (KNOWN_MAPPINGS[line.id]) {
      const xbrlId = KNOWN_MAPPINGS[line.id];
      // Verify the element exists in the taxonomy
      const verifyRes = await pool.query<{ label: string }>(
        'SELECT label FROM xbrl_taxonomy_elements WHERE id = $1',
        [xbrlId]
      );
      const xbrlLabel = verifyRes.rows[0]?.label ?? null;

      results.push({
        sabit_id: line.id,
        sabit_name: line.name,
        xbrl_element_id: xbrlId,
        xbrl_label: xbrlLabel,
        source: 'hardcoded',
        similarity: 1.0,
      });

      // Update the fs_taxonomy_lines table
      await pool.query(
        'UPDATE fs_taxonomy_lines SET xbrl_element_id = $1 WHERE id = $2',
        [xbrlId, line.id]
      );
      hardcoded++;
      continue;
    }

    // Use search for non-hardcoded lines
    const balanceDir = line.normal_balance === 'debit' ? 'debit' as const : 'credit' as const;
    const statementMap: Record<string, string> = { PL: 'IS', BS: 'BS', CF: 'CF' };
    const searchResults = await searchXBRL(pool, line.name, {
      balanceDirection: balanceDir,
      statement: statementMap[line.statement] ?? undefined,
      limit: 5,
    });

    if (searchResults.length > 0 && searchResults[0].similarity >= MIN_SIMILARITY) {
      const best = searchResults[0];
      results.push({
        sabit_id: line.id,
        sabit_name: line.name,
        xbrl_element_id: best.id,
        xbrl_label: best.label,
        source: 'search',
        similarity: best.similarity,
      });

      await pool.query(
        'UPDATE fs_taxonomy_lines SET xbrl_element_id = $1 WHERE id = $2',
        [best.id, line.id]
      );
      searched++;
    } else {
      results.push({
        sabit_id: line.id,
        sabit_name: line.name,
        xbrl_element_id: null,
        xbrl_label: null,
        source: 'none',
        similarity: searchResults[0]?.similarity ?? null,
      });
      unmatched++;
    }
  }

  console.log(`\n[map_sabit] Mapping complete:`);
  console.log(`  Hardcoded: ${hardcoded}`);
  console.log(`  Search-matched: ${searched}`);
  console.log(`  Unmatched: ${unmatched}`);
  console.log(`  Total: ${results.length}`);

  console.log('\n[map_sabit] All mappings:');
  for (const r of results) {
    const status = r.source === 'none' ? 'NO MATCH' : `${r.source} (${((r.similarity ?? 0) * 100).toFixed(0)}%)`;
    console.log(`  ${r.sabit_id} -> ${r.xbrl_element_id ?? '(none)'} [${status}]`);
    if (r.xbrl_label) {
      console.log(`    XBRL: "${r.xbrl_label}"`);
    }
  }
}

const isMain = process.argv[1]?.includes('map_sabit_to_xbrl');
if (isMain) {
  mapSabitToXbrl().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { mapSabitToXbrl, KNOWN_MAPPINGS };
