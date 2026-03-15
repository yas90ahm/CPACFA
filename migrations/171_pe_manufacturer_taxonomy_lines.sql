-- Renumbered from 148 to 171 to resolve duplicate prefix
-- Migration 148: Add missing taxonomy lines for PE-backed manufacturer support
-- These lines fill gaps identified in the AI Engineering Audit

-- Deferred Revenue (Current)
INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance)
VALUES ('fs_liability_deferred_rev_current', 'BS_LIAB_DEFERRED_REV_CURRENT', 'Deferred Revenue (Current)', 'BS', 'fs_liability_current', 'credit')
ON CONFLICT (id) DO NOTHING;

-- Deferred Revenue (Non-Current)
INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance)
VALUES ('fs_liability_deferred_rev_noncurrent', 'BS_LIAB_DEFERRED_REV_NONCURRENT', 'Deferred Revenue (Non-Current)', 'BS', 'fs_liability_noncurrent', 'credit')
ON CONFLICT (id) DO NOTHING;

-- Deferred Tax Assets
INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance)
VALUES ('fs_asset_dta', 'BS_ASSET_DTA', 'Deferred Tax Assets', 'BS', 'fs_asset_noncurrent', 'debit')
ON CONFLICT (id) DO NOTHING;

-- Current Tax Expense (splits Income Tax Expense)
INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance)
VALUES ('fs_tax_current', 'PL_TAX_CURRENT', 'Current Income Tax Expense', 'PL', 'fs_tax_expense', 'debit')
ON CONFLICT (id) DO NOTHING;

-- Deferred Tax Expense (splits Income Tax Expense)
INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance)
VALUES ('fs_tax_deferred', 'PL_TAX_DEFERRED', 'Deferred Income Tax Expense', 'PL', 'fs_tax_expense', 'debit')
ON CONFLICT (id) DO NOTHING;

-- Product Revenue (sub-line under Revenue)
INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance)
VALUES ('fs_revenue_product', 'PL_REVENUE_PRODUCT', 'Product Revenue', 'PL', 'fs_revenue', 'credit')
ON CONFLICT (id) DO NOTHING;

-- Service Revenue (sub-line under Revenue)
INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance)
VALUES ('fs_revenue_service', 'PL_REVENUE_SERVICE', 'Service Revenue', 'PL', 'fs_revenue', 'credit')
ON CONFLICT (id) DO NOTHING;

-- Other Revenue (sub-line under Revenue)
INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance)
VALUES ('fs_revenue_other', 'PL_REVENUE_OTHER', 'Other Revenue', 'PL', 'fs_revenue', 'credit')
ON CONFLICT (id) DO NOTHING;

-- COGS sub-components
INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance)
VALUES ('fs_cogs_materials', 'PL_COGS_MATERIALS', 'Direct Materials', 'PL', 'fs_cogs', 'debit')
ON CONFLICT (id) DO NOTHING;

INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance)
VALUES ('fs_cogs_labor', 'PL_COGS_LABOR', 'Direct Labor', 'PL', 'fs_cogs', 'debit')
ON CONFLICT (id) DO NOTHING;

INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance)
VALUES ('fs_cogs_overhead', 'PL_COGS_OVERHEAD', 'Manufacturing Overhead', 'PL', 'fs_cogs', 'debit')
ON CONFLICT (id) DO NOTHING;

-- Gain/Loss on Asset Disposal
INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance)
VALUES ('fs_other_gain_loss', 'PL_OTHER_GAIN_LOSS', 'Gain / (Loss) on Asset Disposal', 'PL', 'fs_other_income', 'credit')
ON CONFLICT (id) DO NOTHING;

-- Additional Paid-In Capital
INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance)
VALUES ('fs_equity_apic', 'BS_EQUITY_APIC', 'Additional Paid-In Capital', 'BS', 'fs_equity', 'credit')
ON CONFLICT (id) DO NOTHING;

-- Dividends Declared (contra-equity, debit-normal)
INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance)
VALUES ('fs_equity_dividends', 'BS_EQUITY_DIVIDENDS', 'Dividends Declared', 'BS', 'fs_equity', 'debit')
ON CONFLICT (id) DO NOTHING;
