-- Built-in ERP mapping templates for QuickBooks, Xero, NetSuite, Sage Intacct.
-- These are system-level templates (tenant_id='__system__') that get cloned per-tenant on first sync.

-- QuickBooks Standard TB
INSERT INTO core.erp_mapping_profiles (id, tenant_id, connection_id, provider, profile_name, data_type, is_template, is_active)
VALUES ('tmpl-qb-tb', '__system__', '__template__', 'quickbooks', 'QuickBooks Standard', 'trial_balance', TRUE, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO core.erp_mapping_rules (profile_id, source_field, canonical_field, transform_type, transform_config, is_required, sort_order) VALUES
  ('tmpl-qb-tb', 'ColData[0].id',    'accountCode',  'nested_path', '{"nestedPath":"ColData[0].id"}',    TRUE,  1),
  ('tmpl-qb-tb', 'ColData[0].value', 'accountName',  'nested_path', '{"nestedPath":"ColData[0].value"}', TRUE,  2),
  ('tmpl-qb-tb', 'ColData[1].value', 'debit',        'decimal_coerce', NULL,                              TRUE,  3),
  ('tmpl-qb-tb', 'ColData[2].value', 'credit',       'decimal_coerce', NULL,                              TRUE,  4),
  ('tmpl-qb-tb', 'currency',         'currency',     'default_value', NULL,                                FALSE, 5)
ON CONFLICT DO NOTHING;

-- Xero Standard TB
INSERT INTO core.erp_mapping_profiles (id, tenant_id, connection_id, provider, profile_name, data_type, is_template, is_active)
VALUES ('tmpl-xero-tb', '__system__', '__template__', 'xero', 'Xero Standard', 'trial_balance', TRUE, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO core.erp_mapping_rules (profile_id, source_field, canonical_field, transform_type, transform_config, is_required, sort_order) VALUES
  ('tmpl-xero-tb', 'Cells[0].Attributes[0].Value', 'accountCode',  'nested_path', '{"nestedPath":"Cells[0].Attributes[0].Value"}', TRUE,  1),
  ('tmpl-xero-tb', 'Cells[0].Value',               'accountName',  'nested_path', '{"nestedPath":"Cells[0].Value"}',               TRUE,  2),
  ('tmpl-xero-tb', 'Cells[1].Value',               'debit',        'decimal_coerce', NULL,                                          TRUE,  3),
  ('tmpl-xero-tb', 'Cells[2].Value',               'credit',       'decimal_coerce', NULL,                                          TRUE,  4),
  ('tmpl-xero-tb', 'currency',                     'currency',     'default_value', NULL,                                            FALSE, 5)
ON CONFLICT DO NOTHING;

-- NetSuite Standard TB
INSERT INTO core.erp_mapping_profiles (id, tenant_id, connection_id, provider, profile_name, data_type, is_template, is_active)
VALUES ('tmpl-ns-tb', '__system__', '__template__', 'netsuite', 'NetSuite Standard', 'trial_balance', TRUE, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO core.erp_mapping_rules (profile_id, source_field, canonical_field, transform_type, transform_config, is_required, sort_order) VALUES
  ('tmpl-ns-tb', 'account_code', 'accountCode',  'direct', NULL, TRUE,  1),
  ('tmpl-ns-tb', 'account_name', 'accountName',  'direct', NULL, TRUE,  2),
  ('tmpl-ns-tb', 'debit',        'debit',        'decimal_coerce', NULL, TRUE,  3),
  ('tmpl-ns-tb', 'credit',       'credit',       'decimal_coerce', NULL, TRUE,  4),
  ('tmpl-ns-tb', 'currency',     'currency',     'default_value', NULL, FALSE, 5)
ON CONFLICT DO NOTHING;

-- Sage Intacct Standard TB
INSERT INTO core.erp_mapping_profiles (id, tenant_id, connection_id, provider, profile_name, data_type, is_template, is_active)
VALUES ('tmpl-intacct-tb', '__system__', '__template__', 'sage_intacct', 'Sage Intacct Standard', 'trial_balance', TRUE, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO core.erp_mapping_rules (profile_id, source_field, canonical_field, transform_type, transform_config, is_required, sort_order) VALUES
  ('tmpl-intacct-tb', 'ACCOUNTNO',    'accountCode',  'direct',         NULL, TRUE,  1),
  ('tmpl-intacct-tb', 'TITLE',        'accountName',  'direct',         NULL, TRUE,  2),
  ('tmpl-intacct-tb', 'DEBIT',        'debit',        'decimal_coerce', NULL, TRUE,  3),
  ('tmpl-intacct-tb', 'CREDIT',       'credit',       'decimal_coerce', NULL, TRUE,  4),
  ('tmpl-intacct-tb', 'CURRENCY',     'currency',     'direct',         NULL, FALSE, 5),
  ('tmpl-intacct-tb', 'LOCATIONID',   'location',     'direct',         NULL, FALSE, 6),
  ('tmpl-intacct-tb', 'DEPARTMENTID', 'department',   'direct',         NULL, FALSE, 7)
ON CONFLICT DO NOTHING;
