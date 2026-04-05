/**
 * ERP Mapping Profile types — defines how each ERP's raw data maps to canonical schema.
 * Profiles are stored in DB (not code) so they can be updated without redeployment.
 */

export type TransformType =
  | 'direct'           // 1:1 field copy
  | 'decimal_coerce'   // string→Decimal with format stripping ($, commas)
  | 'date_parse'       // date string→ISO YYYY-MM-DD
  | 'default_value'    // use default when source is null
  | 'strip_format'     // remove currency symbols, whitespace
  | 'nested_path'      // JSON path extraction (e.g. ColData[0].value)
  | 'conditional'      // if/else based on source value
  | 'concatenate';     // join multiple fields

export interface TransformConfig {
  /** For date_parse: source format e.g. "MM/DD/YYYY", "DD-MMM-YYYY". */
  sourceDateFormat?: string;
  /** For strip_format: characters to strip e.g. "$, ". */
  stripChars?: string;
  /** For nested_path: JSON path e.g. "ColData[0].id". */
  nestedPath?: string;
  /** For conditional: if/else logic. */
  condition?: {
    field: string;
    operator: 'eq' | 'ne' | 'contains' | 'gt' | 'lt';
    value: string;
    thenValue: string;
    elseValue: string;
  };
  /** For concatenate: field names to join. */
  fields?: string[];
  /** For concatenate: separator between fields. */
  separator?: string;
}

export type MappingDataType = 'trial_balance' | 'journal_entry' | 'chart_of_accounts';

export interface ErpMappingProfile {
  id: string;
  tenantId: string;
  connectionId: string;
  provider: string;
  profileName: string;
  dataType: MappingDataType;
  isTemplate: boolean;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface ErpMappingRule {
  id: string;
  profileId: string;
  sourceField: string;
  canonicalField: string;
  transformType: TransformType;
  transformConfig: TransformConfig | null;
  defaultValue: string | null;
  isRequired: boolean;
  sortOrder: number;
  createdAt: string;
}

/** Input for creating a new mapping profile. */
export interface CreateMappingProfileInput {
  tenantId: string;
  connectionId: string;
  provider: string;
  profileName: string;
  dataType: MappingDataType;
  createdBy?: string;
  rules: Omit<ErpMappingRule, 'id' | 'profileId' | 'createdAt'>[];
}
