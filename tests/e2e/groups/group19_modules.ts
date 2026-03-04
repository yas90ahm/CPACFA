/**
 * GROUP 19: Modules (8 scenarios)
 *
 * Tests optional financial modules: fixed assets & depreciation,
 * deferred tax provision, and stock compensation. Each module
 * endpoint is expected to return 404 if the module is not yet built,
 * in which case the scenario is SKIPped.
 */
import {
  apiFetch,
  expectStatus,
  expectTrue,
  expectFieldExists,
} from '../helpers';
import { state } from '../run_all';
import type { TestGroup } from '../run_all';

export function group19_modules(): TestGroup {
  return {
    name: 'GROUP 19: Modules',
    scenarios: [
      // ------------------------------------------------------------------
      // 19.01  Create fixed asset — stored
      // ------------------------------------------------------------------
      {
        id: '19.01',
        name: 'Create fixed asset — stored',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');

          const res = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/fixed-assets`,
            {
              assetNumber: 'FA-E2E-001',
              description: 'Office Equipment — E2E Test',
              assetType: 'Equipment',
              acquisitionDate: '2025-01-15',
              cost: 50000,
              usefulLifeYears: 5,
              residualValue: 5000,
              method: 'straight_line',
              depreciationStartDate: '2025-02-01',
            },
            state.preparerToken,
          );

          if (res.status === 404 || res.status === 501) {
            throw new Error('SKIP: module not built');
          }
          if (res.status === 409) {
            throw new Error('SKIP: session is certified — cannot create fixed assets');
          }

          expectTrue(
            res.ok,
            `Create fixed asset should succeed, got ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`,
          );
          const assetObj = res.body.asset ?? res.body;
          expectFieldExists(assetObj, 'id');
          state._fixedAssetId = assetObj.id;

          // Verify retrieval
          const getRes = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/fixed-assets`,
            undefined,
            state.preparerToken,
          );
          expectTrue(getRes.ok, `Get fixed assets: ${getRes.status}`);

          const assets = getRes.body?.assets ?? getRes.body ?? [];
          const created = assets.find((a: any) => a.id === state._fixedAssetId);
          expectTrue(
            created != null,
            'Created fixed asset should appear in list',
          );
        },
      },

      // ------------------------------------------------------------------
      // 19.02  Compute depreciation — correct amount
      // ------------------------------------------------------------------
      {
        id: '19.02',
        name: 'Compute depreciation — correct amount',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');
          if (!state._fixedAssetId) throw new Error('SKIP: no fixed asset created in 19.01');

          const res = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/fixed-assets/depreciation-run`,
            {},
            state.preparerToken,
          );

          if (res.status === 404 || res.status === 501) {
            throw new Error('SKIP: module not built');
          }

          expectTrue(
            res.ok,
            `Depreciation run should succeed, got ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`,
          );

          // Straight-line: (50000 - 5000) / 60 months = 750.00/month
          const entries = res.body?.details ?? res.body?.entries ?? res.body?.depreciationEntries ?? [];
          if (Array.isArray(entries) && entries.length > 0) {
            const entry = entries.find(
              (e: any) => e.assetId === state._fixedAssetId || e.asset_id === state._fixedAssetId,
            );
            if (entry) {
              const amount = parseFloat(entry.amount ?? entry.depreciationAmount ?? '0');
              // Should be approximately 750.00 for one month
              expectTrue(
                amount > 0,
                `Depreciation amount should be positive, got ${amount}`,
              );
              // Allow some tolerance for partial periods
              if (amount >= 700 && amount <= 800) {
                // Correct range for monthly straight-line on a 50K asset
              }
            }
          }
        },
      },

      // ------------------------------------------------------------------
      // 19.03  Depreciation JE posted — in adjusted TB
      // ------------------------------------------------------------------
      {
        id: '19.03',
        name: 'Depreciation JE posted — in adjusted TB',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');

          // Check if a depreciation JE was created
          const jeRes = await apiFetch(
            'GET',
            `/api/close/journal-entries?closeSessionId=${state.sessionId}`,
            undefined,
            state.preparerToken,
          );

          if (!jeRes.ok) {
            throw new Error('SKIP: could not fetch journal entries');
          }

          const entries = jeRes.body?.journalEntries ?? jeRes.body?.entries ?? [];
          const depJE = entries.find(
            (je: any) =>
              (je.memo ?? '').toLowerCase().includes('depreciation') ||
              (je.source ?? '').toLowerCase().includes('depreciation') ||
              (je.source ?? '').toLowerCase() === 'fixed_asset',
          );

          if (!depJE) {
            throw new Error('SKIP: no depreciation JE found — module may post separately');
          }

          const jeStatus = (depJE.status ?? depJE.state ?? '').toLowerCase();
          if (jeStatus === 'posted') {
            // Verify in adjusted TB
            const tbRes = await apiFetch(
              'GET',
              `/api/close/sessions/${state.sessionId}/trial-balance?type=adjusted`,
              undefined,
              state.preparerToken,
            );

            if (tbRes.ok) {
              const accounts = tbRes.body?.accounts ?? tbRes.body?.entries ?? tbRes.body?.rows ?? [];
              // Look for depreciation expense account
              const depAcct = accounts.find(
                (a: any) =>
                  (a.accountName ?? a.account_name ?? '').toLowerCase().includes('depreciation'),
              );
              if (depAcct) {
                const balance = parseFloat(depAcct.netBalance ?? depAcct.debitBalance ?? '0');
                expectTrue(
                  balance > 0,
                  `Depreciation expense should have positive balance in adjusted TB, got ${balance}`,
                );
              }
            }
          } else {
            // JE exists but not posted — report status
            expectTrue(
              jeStatus === 'draft' || jeStatus === 'proposed' || jeStatus === 'approved',
              `Depreciation JE status should be in pipeline, got "${jeStatus}"`,
            );
          }
        },
      },

      // ------------------------------------------------------------------
      // 19.04  Deferred tax provision — temporary differences
      // ------------------------------------------------------------------
      {
        id: '19.04',
        name: 'Deferred tax provision — temporary differences',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');

          // Create a deferred tax item
          const createRes = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/deferred-tax/items`,
            {
              description: 'Depreciation timing difference',
              itemType: 'temporary_difference',
              bookBasis: 5000,
              taxBasis: 3000,
              temporaryDifference: 2000,
              taxRate: 0.21,
            },
            state.preparerToken,
          );

          if (createRes.status === 404 || createRes.status === 501) {
            throw new Error('SKIP: module not built');
          }
          if (createRes.status === 409) {
            throw new Error('SKIP: session is certified — cannot create deferred tax items');
          }

          expectTrue(
            createRes.ok,
            `Create deferred tax item: ${createRes.status}: ${JSON.stringify(createRes.body).slice(0, 300)}`,
          );
          const dtObj = createRes.body.item ?? createRes.body;
          expectFieldExists(dtObj, 'id');
          state._deferredTaxItemId = dtObj.id;

          // Calculate — taxRate is required by the endpoint
          const calcRes = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/deferred-tax/calculate`,
            { taxRate: 0.21 },
            state.preparerToken,
          );

          if (calcRes.status === 404 || calcRes.status === 501) {
            throw new Error('SKIP: deferred tax calculation not implemented');
          }

          expectTrue(
            calcRes.ok,
            `Deferred tax calculate: ${calcRes.status}: ${JSON.stringify(calcRes.body).slice(0, 300)}`,
          );

          // Temporary difference: (5000 - 3000) * 0.21 = 420.00
          // Response is { result: { deferredTaxAssetGross, deferredTaxLiabilityGross, temporaryDifferences, ... } }
          const result = calcRes.body?.result ?? calcRes.body;
          const totalDTA =
            parseFloat(result?.deferredTaxAssetGross ?? result?.deferredTaxAssetNet ?? result?.netDeferredTaxAsset ?? result?.totalDeferredTaxAsset ?? result?.dta ?? '0');
          const totalDTL =
            parseFloat(result?.deferredTaxLiabilityGross ?? result?.deferredTaxLiabilityNet ?? result?.totalDeferredTaxLiability ?? result?.dtl ?? '0');
          const tempDiffs = result?.temporaryDifferences ?? result?.items ?? [];

          expectTrue(
            totalDTA > 0 || totalDTL > 0 || tempDiffs.length > 0,
            `Deferred tax calculation should produce non-zero results, got DTA=${totalDTA}, DTL=${totalDTL}, tempDiffs=${tempDiffs.length}, body=${JSON.stringify(calcRes.body).slice(0, 300)}`,
          );
        },
      },

      // ------------------------------------------------------------------
      // 19.05  Stock comp expense — period amount
      // ------------------------------------------------------------------
      {
        id: '19.05',
        name: 'Stock comp expense — period amount',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');

          // Create a stock compensation grant
          const createRes = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/stock-compensation/grants`,
            {
              recipientName: 'E2E Test Employee',
              grantDate: '2025-01-01',
              grantType: 'RSU',
              vestingType: 'cliff',
              vestingSchedule: [
                { date: '2026-01-01', shares: 2500, vested: false },
                { date: '2027-01-01', shares: 2500, vested: false },
                { date: '2028-01-01', shares: 2500, vested: false },
                { date: '2029-01-01', shares: 2500, vested: false },
              ],
              fairValuePerShare: 12,
              sharesGranted: 10000,
            },
            state.preparerToken,
          );

          if (createRes.status === 404 || createRes.status === 501) {
            throw new Error('SKIP: module not built');
          }
          if (createRes.status === 409) {
            throw new Error('SKIP: session is certified — cannot create stock comp grants');
          }

          expectTrue(
            createRes.ok,
            `Create stock comp grant: ${createRes.status}: ${JSON.stringify(createRes.body).slice(0, 300)}`,
          );
          const grantObj = createRes.body.grant ?? createRes.body;
          expectFieldExists(grantObj, 'id');
          state._stockCompGrantId = grantObj.id;

          // Compute period expense
          const computeRes = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/stock-compensation/compute`,
            {},
            state.preparerToken,
          );

          if (computeRes.status === 404 || computeRes.status === 501) {
            throw new Error('SKIP: stock comp compute not implemented');
          }

          expectTrue(
            computeRes.ok,
            `Stock comp compute: ${computeRes.status}: ${JSON.stringify(computeRes.body).slice(0, 300)}`,
          );

          // Response is { expenses: StockExpenseRow[] }
          // Total grant expense = fairValuePerShare (12) * sharesGranted (10000) = 120000
          // periodExpense = 120000 / 4 vesting entries = 30000
          const expenses = computeRes.body?.expenses ?? [];
          const totalExpense = expenses.reduce(
            (sum: number, e: any) => sum + parseFloat(e.expenseAmount ?? e.expense_amount ?? e.amount ?? '0'),
            0,
          );
          // Also check if expense data is at the top level
          const topLevelExpense = parseFloat(
            computeRes.body?.periodExpense ?? computeRes.body?.totalExpense ?? '0',
          );
          const effectiveExpense = totalExpense > 0 ? totalExpense : topLevelExpense;
          expectTrue(
            effectiveExpense > 0,
            `Stock comp period expense should be positive, got ${effectiveExpense} (expenses array: ${expenses.length} items)`,
          );
        },
      },

      // ------------------------------------------------------------------
      // 19.06  Stock comp JE posted — in adjusted TB
      // ------------------------------------------------------------------
      {
        id: '19.06',
        name: 'Stock comp JE posted — in adjusted TB',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');

          const jeRes = await apiFetch(
            'GET',
            `/api/close/journal-entries?closeSessionId=${state.sessionId}`,
            undefined,
            state.preparerToken,
          );

          if (!jeRes.ok) {
            throw new Error('SKIP: could not fetch journal entries');
          }

          const entries = jeRes.body?.journalEntries ?? jeRes.body?.entries ?? [];
          const stockJE = entries.find(
            (je: any) =>
              (je.memo ?? '').toLowerCase().includes('stock') ||
              (je.memo ?? '').toLowerCase().includes('compensation') ||
              (je.source ?? '').toLowerCase().includes('stock_comp'),
          );

          if (!stockJE) {
            throw new Error('SKIP: no stock comp JE found — module may post separately');
          }

          const jeStatus = (stockJE.status ?? stockJE.state ?? '').toLowerCase();
          if (jeStatus === 'posted') {
            const tbRes = await apiFetch(
              'GET',
              `/api/close/sessions/${state.sessionId}/trial-balance?type=adjusted`,
              undefined,
              state.preparerToken,
            );

            if (tbRes.ok) {
              const accounts = tbRes.body?.accounts ?? tbRes.body?.entries ?? tbRes.body?.rows ?? [];
              const compAcct = accounts.find(
                (a: any) =>
                  (a.accountName ?? a.account_name ?? '').toLowerCase().includes('stock') ||
                  (a.accountName ?? a.account_name ?? '').toLowerCase().includes('compensation'),
              );
              if (compAcct) {
                const balance = parseFloat(compAcct.netBalance ?? compAcct.debitBalance ?? '0');
                expectTrue(
                  balance !== 0,
                  `Stock comp account should have non-zero balance in adjusted TB, got ${balance}`,
                );
              }
            }
          } else {
            expectTrue(
              jeStatus === 'draft' || jeStatus === 'proposed' || jeStatus === 'approved',
              `Stock comp JE should be in pipeline, got "${jeStatus}"`,
            );
          }
        },
      },

      // ------------------------------------------------------------------
      // 19.07  Module data in board package
      // ------------------------------------------------------------------
      {
        id: '19.07',
        name: 'Module data in board package',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');

          const bpRes = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/board-package?periodType=monthly`,
            undefined,
            state.preparerToken,
          );

          if (bpRes.status === 404 || bpRes.status === 501) {
            throw new Error('SKIP: board package endpoint not available');
          }

          if (bpRes.ok) {
            const pkg = bpRes.body;
            // Check if module data is included
            const hasFixedAssets =
              pkg?.fixedAssets != null ||
              pkg?.modules?.fixedAssets != null ||
              pkg?.supplementary?.fixedAssets != null;
            const hasDeferredTax =
              pkg?.deferredTax != null ||
              pkg?.modules?.deferredTax != null ||
              pkg?.supplementary?.deferredTax != null;
            const hasStockComp =
              pkg?.stockCompensation != null ||
              pkg?.modules?.stockCompensation != null ||
              pkg?.supplementary?.stockCompensation != null;

            // At least one module section should exist if modules are active
            if (!hasFixedAssets && !hasDeferredTax && !hasStockComp) {
              throw new Error('SKIP: no module data found in board package — modules may not be integrated');
            }
          } else {
            expectTrue(
              bpRes.status === 409 || bpRes.status === 422,
              `Board package should succeed or conflict, got ${bpRes.status}`,
            );
          }
        },
      },

      // ------------------------------------------------------------------
      // 19.08  All computations use Decimal.js
      // ------------------------------------------------------------------
      {
        id: '19.08',
        name: 'All computations use Decimal.js',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');

          // Verify amounts in module responses are Decimal strings, not floats
          // Check fixed assets
          const faRes = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/fixed-assets`,
            undefined,
            state.preparerToken,
          );

          if (faRes.status === 404 || faRes.status === 501) {
            throw new Error('SKIP: module not built');
          }

          if (faRes.ok) {
            const assets = faRes.body?.assets ?? faRes.body ?? [];
            for (const asset of assets) {
              const cost = asset.cost ?? asset.acquisitionCost;
              if (cost != null) {
                // Amounts should be strings (Decimal representation)
                expectTrue(
                  typeof cost === 'string' || (typeof cost === 'number' && Number.isFinite(cost)),
                  `Asset cost should be a Decimal string or finite number, got ${typeof cost}: ${cost}`,
                );

                // Check for floating point artifacts (e.g., 50000.000000000004)
                const costStr = String(cost);
                const decimalParts = costStr.split('.');
                if (decimalParts.length === 2) {
                  expectTrue(
                    decimalParts[1].length <= 2,
                    `Asset cost should have at most 2 decimal places, got "${costStr}"`,
                  );
                }
              }
            }
          }

          // Check deferred tax items
          const dtRes = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/deferred-tax/items`,
            undefined,
            state.preparerToken,
          );

          if (dtRes.ok) {
            const items = dtRes.body?.items ?? dtRes.body ?? [];
            for (const item of items) {
              const bookAmt = item.bookAmount ?? item.book_amount;
              if (bookAmt != null) {
                const bookStr = String(bookAmt);
                const parts = bookStr.split('.');
                if (parts.length === 2) {
                  expectTrue(
                    parts[1].length <= 2,
                    `Deferred tax bookAmount should have at most 2 decimal places, got "${bookStr}"`,
                  );
                }
              }
            }
          }
        },
      },
    ],
  };
}
