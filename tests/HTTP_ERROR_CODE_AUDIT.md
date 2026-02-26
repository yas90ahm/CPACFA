# HTTP Error Code Consistency Audit

**Standard error codes:**
- 400: User input error (missing param, malformed data)
- 401: Missing or invalid auth token
- 403: Policy block (export gate, permissions, feature disabled)
- 404: Resource not found
- 409: Conflict (e.g., CPA-CFA conflict)
- 422: Integrity failure (imbalanced TB, failed equation)
- 500: Unexpected server error

---

## Files Changed

### 1. `src/routes/approvals.ts`

**Issue:** 404 used for "No approval workflow for this resource type" — should be 403 (policy/feature not configured).

**Before:**
```typescript
if (!workflow) {
  res.status(404).json({ error: 'No approval workflow for this resource type' });
  return;
}
```

**After:**
```typescript
if (!workflow) {
  res.status(403).json({
    error: 'No approval workflow for this resource type',
    code: 'WORKFLOW_NOT_CONFIGURED',
    message: 'Approval workflow is not configured for this resource type. Create a workflow first.',
  });
  return;
}
```

---

### 2. `src/routes/export.ts`

**Issue:** Export gate failures missing `allowed: false`, `alert`, and consistent error body structure.

**Before (RESOLUTION_MISMATCH):**
```typescript
res.status(422).json({
  code: 'RESOLUTION_MISMATCH',
  message: gateResult.message ?? 'Ledger resolution mismatch: export blocked.',
  details: gateResult.details,
});
```

**After:**
```typescript
res.status(422).json({
  allowed: false,
  alert: RESOLUTION_MISMATCH,
  code: 'RESOLUTION_MISMATCH',
  message: gateResult.message ?? 'Ledger resolution mismatch: export blocked.',
  details: gateResult.details,
});
```

**Before (generic gate failure):**
```typescript
res.status(403).json({
  error: gateResult.alert ?? 'Export blocked',
  code: gateResult.alert,
  message: gateResult.message ?? 'Financial export blocked.',
});
```

**After:**
```typescript
res.status(403).json({
  allowed: false,
  alert: gateResult.alert ?? 'CRITICAL_TAMPER_ALERT',
  code: gateResult.alert,
  error: gateResult.alert ?? 'Export blocked',
  message: gateResult.message ?? 'Financial export blocked.',
});
```

**Before (tampering attempt):**
```typescript
res.status(403).json({
  error: 'Tampering attempt detected',
  code: TAMPERING_ATTEMPT_DETECTED,
  message: 'Materiality flags cannot be supplied by client.',
});
```

**After:**
```typescript
res.status(403).json({
  allowed: false,
  alert: TAMPERING_ATTEMPT_DETECTED,
  code: TAMPERING_ATTEMPT_DETECTED,
  error: 'Tampering attempt detected',
  message: 'Materiality flags cannot be supplied by client.',
});
```

---

### 3. `src/routes/audit/audit_binder.ts`

**Issue:** Export gate failures missing `allowed: false` and `alert` in error body.

**Before (RESOLUTION_MISMATCH):**
```typescript
res.status(422).json({
  code: 'RESOLUTION_MISMATCH',
  message: gateResult.message ?? 'Ledger resolution mismatch: export blocked.',
  details: gateResult.details,
});
```

**After:**
```typescript
res.status(422).json({
  allowed: false,
  alert: RESOLUTION_MISMATCH,
  code: 'RESOLUTION_MISMATCH',
  message: gateResult.message ?? 'Ledger resolution mismatch: export blocked.',
  details: gateResult.details,
});
```

**Before (generic gate failure):**
```typescript
res.status(403).json({
  error: gateResult.alert ?? 'Export blocked',
  code: gateResult.alert,
  message: gateResult.message ?? 'Binder export blocked. Truth Gate or audit chain check failed.',
});
```

**After:**
```typescript
res.status(403).json({
  allowed: false,
  alert: gateResult.alert ?? 'CRITICAL_TAMPER_ALERT',
  code: gateResult.alert,
  error: gateResult.alert ?? 'Export blocked',
  message: gateResult.message ?? 'Binder export blocked. Truth Gate or audit chain check failed.',
});
```

---

### 4. `src/routes/close/close_journal_entries.ts`

**Issue:** Approve JE error handler missing `code` in response body for consistency.

**Before:**
```typescript
res.status(status).json({ error: e.message });
```

**After:**
```typescript
res.status(status).json({ error: e.message, code: e.code });
```

---

## Items Verified (No Change Needed)

- **approvals.ts GET /requests/:id:** When `!pool`, returns 503 "Tenant database required" (correct).
- **404 for resource not found:** Close session, journal entry, attachment, request, etc. — all correctly use 404.
- **send500 usage:** All send500 calls are in catch blocks for unexpected errors; no known errors are incorrectly returning 500.
- **certification.ts 404:** "No certification artifact for this close session" is resource not found — 404 is correct.

---

## Export Gate Error Body Contract

All export gate failure responses now include:
- `allowed: false`
- `alert`: One of `CRITICAL_TAMPER_ALERT`, `TAMPERING_ATTEMPT_DETECTED`, `RESOLUTION_MISMATCH`, `UNRESOLVED_CONFLICTS_ALERT`
- `message`: Human-readable explanation
