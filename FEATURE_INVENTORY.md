# Sabit Feature Inventory — Complete Workflow Reference

**Date:** 2026-03-27
**Purpose:** UI/UX designer reference — every feature, every workflow, every persona
**Source:** Line-by-line audit of 212 migrations, 121 services, 150+ API endpoints, 47 pages, 76 components

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Personas & Access](#2-personas--access)
3. [The Close Pipeline (7 Steps)](#3-the-close-pipeline)
4. [13 Accounting Modules](#4-accounting-modules)
5. [Governance & Audit](#5-governance--audit)
6. [Portfolio & Multi-Entity](#6-portfolio--multi-entity)
7. [Settings & Configuration](#7-settings--configuration)
8. [AI System & HITL Architecture](#8-ai-system--hitl-architecture)
9. [Certification & Cryptographic Signing](#9-certification--cryptographic-signing)
10. [Complete Persona Journeys](#10-complete-persona-journeys)
11. [Database Schema Summary](#11-database-schema-summary)
12. [Frontend Page Map](#12-frontend-page-map)
13. [Component Library](#13-component-library)

---

## 1. Architecture Overview

**What Sabit is:** A financial close automation engine for PE-backed mid-market companies ($100M-$1B revenue). It takes a company's general ledger and produces four certified financial statements (Balance Sheet, Income Statement, Cash Flow, Statement of Stockholders' Equity) through a gated pipeline with cryptographic certification.

**Stack:** Node.js + Express + TypeScript + PostgreSQL (backend). Next.js 14 + React 18 + Tailwind (frontend). All money uses Decimal.js. PostgreSQL uses NUMERIC(20,2). Hash-chained append-only audit ledger. Ed25519 cryptographic signing.

**Core principle:** Sabit acts first. The controller confirms, adjusts, or overrides. Every input field arrives pre-filled or justified empty.

---

## 2. Personas & Access

| Persona | Role | Landing Page | Can Do | Cannot Do |
|---------|------|-------------|--------|-----------|
| **Controller** | Does the close work | `/close` | Upload GL, map accounts, create/propose JEs, complete recons, explain variances, generate statements, submit for review | Approve own JEs, certify, lock |
| **Reviewer / CFO** | Reviews and certifies | `/close/:id/review` | Approve/reject JEs, approve recons, approve variances, certify (Ed25519), lock, reopen | Create JEs they then approve (SoD) |
| **Operating Partner** | PE fund oversight | `/portfolio` | View all entities, close status, financials, alerts, board packages | Modify any close data (read-only) |
| **Auditor** | External verification | `/verify` | Verify artifacts, access binder, view trail, download workpapers | Modify any data (read-only) |
| **Admin** | System configuration | `/settings` | Create entities, invite users, assign roles, configure policies, manage integrations | N/A |

---

## 3. The Close Pipeline

State machine: **OPEN -> IN_PROGRESS -> UNDER_REVIEW -> CERTIFIED -> SUBSEQUENT_EVENTS_REVIEW -> LOCKED**

11 hard gates. All must pass before advancing.

### Step 1: Upload & Map Trial Balance

**What happens:** Controller uploads GL as CSV. System parses, validates, derives trial balance. GL health analysis detects duplicates, reversed entries, orphaned accounts.

**Page:** `/close/[sessionId]/trial-balance`
**Data:** Account table (code, name, type, debit, credit), TB totals, balance status
**Actions:** Upload CSV, preview columns, map headers, ingest, filter, drill to GL
**Gate:** `tb_balanced` — debits = credits

### Step 2: Map Accounts

**What happens:** 6-layer AI pipeline classifies GL accounts to FS line items. Layer 0: 148 curated patterns (98% confidence). Layers 1-4: XBRL trigram, FS name match, Claude direct, RAG batch. Layer 5: Auto-propose with detectSuspects validation. Controller accepts, rejects, or manually maps.

**Page:** `/close/[sessionId]/mapping`
**Data:** Account rows with AI suggestion, confidence bar (>=80% forest, 60-79% amber, <60% rust), taxonomy picker
**Header stat:** "Sabit classified 78 of 79 accounts automatically - 1 needs your review"
**Actions:** Accept/reject AI suggestions, manually select FS line, auto-classify, bulk actions
**Gate:** `all_accounts_mapped`

### Step 3: Reconciliation

**What happens:** System initializes recons for all required BS accounts. Controller enters supporting balance, adds reconciling items. Variance computed automatically (DB GENERATED). Reviewer approves (SoD: preparer != approver).

**Pages:** `/close/[sessionId]/reconciliation` (list), `/[reconId]` (detail)
**Data:** Account, GL balance, supporting balance, variance, tolerance, reconciling items, status, evidence
**Actions:** Enter supporting balance, add items, upload evidence, complete, approve
**Gate:** `recons_complete`

### Step 4: Adjustments (Journal Entries)

**What happens:** System auto-proposes from 13 modules. Recurring templates proposed. Manual entries created. JE lifecycle: draft -> proposed -> approved -> posted. Balance validated (Decimal.js exact match + DB trigger). SoD enforced. Shadow auditor pre-checks. Posted = immutable.

**Page:** `/close/[sessionId]/adjustments`
**Tabs:** Entries | Templates
**Data:** JE table (number, memo, accounts, amount, status, source), template list
**Actions:** Create JE, propose, approve, reject, post, upload evidence, apply/skip templates
**Gate:** `material_jes_approved`

### Step 5: Generate Statements

**What happens:** 4 GAAP statements from adjusted TB. Integrity gate: A = L + E. 9 cross-statement tie checks. Discontinued operations separated.

**Page:** `/close/[sessionId]/statements`
**Tabs:** Income Statement | Balance Sheet | Cash Flow | Equity | EBITDA Bridge | Validation
**Data:** GAAP-formatted tables with prior period comparison, accounting underlines
**Actions:** Generate, toggle adjusted/unadjusted, export PDF/Excel
**Gate:** `statements_current`

### Step 6: Variance Analysis

**What happens:** Period-over-period variances computed (DB GENERATED). Material (>5%) must be explained. AI drafts explanations. AI-drafted require human review attestation.

**Page:** `/close/[sessionId]/variance`
**Data:** FS lines with current/prior, change $, change %, materiality flag, explanation status
**Actions:** View AI draft, edit, approve
**Gate:** `variances_explained` (includes unreviewedAi check)

### Step 7: Review & Certify

**What happens:** CFO reviews. All 11 gates must pass. 9 cross-statement checks. Ed25519 signature. Certification ceremony (dark vault screen).

**Page:** `/close/[sessionId]/review`
**Data:** Gate summary, financials, team, evidence manifest, certification record
**Actions:** Review gates, certify, lock
**Gate:** All 11 passing + cross-statement + integrity

---

## 4. Accounting Modules

| # | Module | ASC | What It Computes | JE Pattern | Page |
|---|--------|-----|-----------------|------------|------|
| 1 | Prepaids | 340 | Monthly amortization, final sweep | Dr Expense, Cr Prepaid | `/prepaids` |
| 2 | Fixed Assets | 360 | SL/DDB depreciation | Dr Depreciation, Cr Accum Dep | `/fixed-assets` |
| 3 | Payroll | - | Daily rate x days accrued | Dr Payroll Exp, Cr Accrued Payroll | `/payroll-accrual` |
| 4 | Debt | - | Principal x rate/365 x days | Dr Interest Exp, Cr Accrued Interest | `/debt-accrual` |
| 5 | Deferred Tax | 740 | Temp diff x tax rate | Dr/Cr DTA/DTL | `/deferred-tax` |
| 6 | Leases | 842 | PV, interest/principal split | Dr Interest+Amort, Cr Liability | `/leases` |
| 7 | Inventory | 330 | Aging bucket x reserve rate | Dr Reserve Exp, Cr Inventory Reserve | `/inventory-reserve` |
| 8 | Stock Comp | 718 | FV x shares / vesting periods | Dr Comp Exp, Cr APIC | `/stock-compensation` |
| 9 | Impairment | 350 | max(0, carrying - recoverable) | Dr Impairment Loss, Cr Asset | `/impairment` |
| 10 | AP Aging | 405 | Cutoff analysis | Dr Expense, Cr AP | `/ap-aging` |
| 11 | AR/CECL | 326 | Bucket x loss rate | Dr Bad Debt, Cr Allowance | `/ar-aging` |
| 12 | Segments | 280 | 10% reportability tests | Report only | `/segments` |
| 13 | Revenue | 606 | Allocation + schedule | Dr AR, Cr Revenue | (integrated) |

---

## 5. Governance & Audit

| Feature | Page | What |
|---------|------|------|
| Audit Trail | `/audit-trail` | Hash-chained, 39 event types, human-readable narratives |
| Audit Binder | `/audit-binder` | PDF/CSV export: statements, JEs, evidence, IRAC justifications |
| Controls | `/controls` | COSO assertions with evidence links |
| Issues | `/discrepancies` | detected -> assigned -> resolved -> verified (blocking prevents cert) |
| Checklist | `/checklist` | GAAP disclosure tracking by standard |
| Board Package | `/board-package` | Executive summary: metrics, variances, validation |
| GL Health | `/gl-health` | Anomaly detection, quality grade |
| GL Quality | `/gl-quality` | Detailed analysis, flagged accounts |
| AI Review | `/ai-review` | All AI suggestions in one place |
| Analytics | `/analytics` | KPIs, trends, benchmarks |

---

## 6. Portfolio & Multi-Entity

| Feature | Page | What |
|---------|------|------|
| Portfolio Dashboard | `/portfolio` | All entities: status, revenue, margin, gates, alerts |
| Entity Detail | `/portfolio/[entityId]` | Single entity: close history, financials, team |
| Consolidated | `/portfolio/consolidated` | Combined statements across entities |
| FX Translation | `/fx-translation` | ASC 830: current-rate + temporal method, CTA |
| Consolidation | `/consolidation` | Elimination rules, NCI computation |

---

## 7. Settings & Configuration

| Page | Configures |
|------|-----------|
| General | Entity name, fiscal YE, currency, materiality, accounting standard |
| Team | Users, roles, invitations |
| Taxonomy | FS line items, XBRL mapping |
| Reconciliation | Required accounts, tolerances, evidence |
| Evidence Policy | File types, materiality thresholds |
| Templates | Recurring AJE templates |
| Integrations | ERP (QB/Xero/NS), bank (Plaid) |

---

## 8. AI System & HITL Architecture

**What AI does:** Classifies accounts (6-layer), drafts variance explanations, suggests revenue allocation, generates IRAC justifications, proposes recon matches.

**What AI NEVER does:** Computes dollar amounts, writes to core tables, posts JEs, certifies.

**4 enforcement mechanisms:** Numeric guardrail, mutation context (AsyncLocalStorage), bridge gate, staging tables.

**Auto-propose (not auto-accept):** System recommends with detectSuspects validation. Every decision logged to audit ledger. Controller sees and confirms.

**Audit trail:** Every LLM call in ai_call_log (immutable). Decision records with FK to ai_call_log. Full-trace API reconstructs any decision.

---

## 9. Certification & Cryptographic Signing

1. All 11 gates pass
2. 9 cross-statement ties validated
3. Integrity gate: debits = credits AND A = L + E
4. Ledger snapshot created (immutable)
5. Evidence manifest built (SHA-256 hashes)
6. Audit chain verified
7. AI metadata gathered
8. Ed25519 signature over SHA-256 artifact hash
9. Certification ceremony (dark vault screen, gold, serif entity name)
10. Post-cert: Subsequent events review (ASC 855) -> LOCKED (terminal)

---

## 10. Complete Persona Journeys

### Controller (Full Close)
1. Login -> `/close` -> Create session
2. Upload GL -> `/trial-balance` -> 52 accounts balanced
3. Map -> `/mapping` -> "51 of 52 auto-classified, 1 needs review"
4. Reconcile -> `/reconciliation` -> 15 accounts, enter balances, upload evidence
5. Adjust -> `/adjustments` -> 8 auto-proposed AJEs + 2 manual
6. Statements -> `/statements` -> 4 statements, integrity passes
7. Variances -> `/variance` -> 3 material, explain/approve
8. Submit -> advance to UNDER_REVIEW -> CFO notified

### CFO (Review & Certify)
1. Login -> notification: "Ready for review"
2. `/review` -> all 11 gates passing
3. Review statements, approve variances
4. Certify -> Ed25519 -> Ceremony screen
5. Download certificate, lock period

### Operating Partner
1. Login -> `/portfolio` -> 12 entities
2. 3 closed, 2 in progress, 1 needs attention
3. Drill to attention item, review close dashboard
4. Download board package when certified

### Auditor
1. Receive artifact -> `/verify` -> signature valid, hash intact
2. Access audit binder -> download workpapers
3. Review trail -> "847 records, no tampering"
4. Check controls -> COSO assertions with evidence

### Admin
1. `/settings/general` -> create entity, set materiality
2. `/settings/team` -> invite controller + CFO
3. `/settings/integrations` -> connect NetSuite
4. `/settings/templates` -> create monthly depreciation template

---

## 11. Database Schema Summary

- **212 migrations**, ~95 tables, 3 schemas (core, ai, audit)
- **8 immutability triggers** (audit_ledger, ledger_snapshots, JEs, cert artifacts, GL, ai_call_log, issue history)
- **6 GENERATED columns** (recon variance, change_amount/%, prepaid monthly/remaining)
- **1 DB kill switch** (migration 131: balance trigger on JE post)
- **1 exclusion constraint** (no overlapping close sessions)

---

## 12. Frontend Page Map

- **47 pages** across 10 flows
- **76 components** in shared library
- **50+ React Query hooks** for API data
- **Design system:** Ledger Palette (no #FFFFFF, weights 400/500 only, serif on cert only)

---

## 13. Component Library

**Layout:** TopBar, Sidebar, StateMachineBanner, ProgressRail, QuickNavigator, IssuePanel
**Data:** DataTable, FinancialTable, MoneyCell, StatusBadge, MetricCard, HashDisplay
**Forms:** Button, MoneyInput, SearchableSelect, FileUploadZone, FilterBar
**AI:** AISuggestionCard, ProvenanceLabel, SmartCloseAssistant
**Audit:** AuditEventNarrative, IntegrityRibbon, ShadowAuditorBadge, CertificationCeremony
**Status:** GateIndicator, PipelineStepper, ProgressRing, ProgressRail

---

*This document is the single source of truth for UI/UX design decisions. Every workflow described here is backed by executable code verified at commit `8494e2c`.*
