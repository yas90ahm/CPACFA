# GAAP and Jurisdiction — Every GAAP First Class

## Supported accounting standards

The application supports **four accounting frameworks** as first-class citizens:

| Standard | Description |
|----------|-------------|
| **US GAAP** | United States Generally Accepted Accounting Principles |
| **IFRS** | International Financial Reporting Standards |
| **ASPE** | Accounting Standards for Private Enterprises (Canada) |
| **FRS 102** | UK Financial Reporting Standard 102 |

All four are fully supported in:

- **Standards registry** — Revenue, asset measurement, lease, depreciation, and related topic mappings
- **Statement generation** — Balance sheet, P&L, cash flow, lease liability/ROU, and standard-specific citations (e.g. ASC 842 for US GAAP)
- **Disclosure checklist** — Framework-aware items and default topic sets per GAAP
- **Notes and accounting policies** — Content driven by the selected standard
- **Topic-level resolution** — Leases, revenue, EPS, and FX resolve from high-level `accountingStandard` (US_GAAP, IFRS, ASPE, FRS102) to topic codification (e.g. ASC 842 vs IFRS 16) via the topic–standard map

There is **no separate “CPA plugin”** or feature flag. These capabilities are part of the main application.

---

## How the reporting standard is chosen

The **reporting standard is determined by the country (jurisdiction) the company reports for**. Where a single country allows more than one framework, **entity type** refines the choice.

### By country

- **United States** → US GAAP  
- **United Kingdom** → FRS 102 (with optional distinction for listed vs private if needed)  
- **Canada** → Depends on entity type (see below).  
- **Other / IFRS jurisdictions** → IFRS when indicated (e.g. by jurisdiction or currency).

### Canada: publicly accountable vs private

In Canada, **publicly accountable** entities must use **IFRS**; **private** entities typically use **ASPE**.

- If the reporting country (or jurisdiction) is Canada and the entity is **publicly accountable** → **IFRS**
- If the reporting country is Canada and the entity is **not** publicly accountable (or the flag is omitted) → **ASPE**

The trial balance and statement endpoints accept an optional **`publiclyAccountable`** flag (and/or entity metadata). When present, it is used by the standard selector to choose IFRS vs ASPE for Canadian entities. This value can also be stored in policy memory per entity for consistency across requests.

---

## References

- **Standard selector:** `src/services/standard_selector.ts` — `inferAccountingStandard(input)` with `country`, `jurisdiction`, and `publiclyAccountable`
- **Topic–standard map:** `src/constants/accounting/topic_standard_map.ts` — Resolution from `accountingStandard` to lease, revenue, EPS, and FX topic standards
- **Standards registry:** `src/constants/accounting/standards_registry.ts`
- **Disclosure checklist:** `src/services/disclosure_checklist_service.ts` — Framework-aware lists and defaults

For a high-level overview of CPA/CFA capabilities, see [CPA_CFA_CAPABILITY.md](CPA_CFA_CAPABILITY.md).
