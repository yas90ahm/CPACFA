# Smoke test for modularized trial-balance and cfo-dashboard routes.
# Run with server already started, or start server with: $env:REQUIRE_AUTH="false"; npx tsx src/server.ts
# Then run: .\scripts\smoke-test-trial-balance-cfo-dashboard.ps1

$base = "http://localhost:3001"
$passed = 0
$failed = 0

Write-Host "=== Smoke test: Trial Balance & CFO Dashboard (modularized) ===" -ForegroundColor Cyan

# 1. Trial Balance - GET /supported
try {
  $r = Invoke-WebRequest -Uri "$base/api/trial-balance/supported" -UseBasicParsing -TimeoutSec 5
  if ($r.StatusCode -eq 200) {
    Write-Host "PASS GET /api/trial-balance/supported -> 200" -ForegroundColor Green
    $passed++
  } elseif ($r.StatusCode -eq 401) {
    Write-Host "OK  GET /api/trial-balance/supported -> 401 (auth required; route exists)" -ForegroundColor Yellow
    $passed++
  } else {
    Write-Host "??  GET /api/trial-balance/supported -> $($r.StatusCode)" -ForegroundColor Yellow
    $passed++
  }
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 401) {
    Write-Host "OK  GET /api/trial-balance/supported -> 401 (auth required; route exists)" -ForegroundColor Yellow
    $passed++
  } else {
    Write-Host "FAIL GET /api/trial-balance/supported -> $($_.Exception.Message)" -ForegroundColor Red
    $failed++
  }
}

# 2. CFO Dashboard - GET /kpi-targets
try {
  $r = Invoke-WebRequest -Uri "$base/api/cfo-dashboard/kpi-targets" -UseBasicParsing -TimeoutSec 5
  if ($r.StatusCode -eq 200) {
    Write-Host "PASS GET /api/cfo-dashboard/kpi-targets -> 200" -ForegroundColor Green
    $passed++
  } elseif ($r.StatusCode -eq 401) {
    Write-Host "OK  GET /api/cfo-dashboard/kpi-targets -> 401 (auth required; route exists)" -ForegroundColor Yellow
    $passed++
  } else {
    Write-Host "??  GET /api/cfo-dashboard/kpi-targets -> $($r.StatusCode)" -ForegroundColor Yellow
    $passed++
  }
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 401) {
    Write-Host "OK  GET /api/cfo-dashboard/kpi-targets -> 401 (auth required; route exists)" -ForegroundColor Yellow
    $passed++
  } else {
    Write-Host "FAIL GET /api/cfo-dashboard/kpi-targets -> $($_.Exception.Message)" -ForegroundColor Red
    $failed++
  }
}

# 3. CFO Dashboard - GET /scenarios
try {
  $r = Invoke-WebRequest -Uri "$base/api/cfo-dashboard/scenarios" -UseBasicParsing -TimeoutSec 5
  if ($r.StatusCode -eq 200) {
    Write-Host "PASS GET /api/cfo-dashboard/scenarios -> 200" -ForegroundColor Green
    $passed++
  } elseif ($r.StatusCode -eq 401) {
    Write-Host "OK  GET /api/cfo-dashboard/scenarios -> 401 (auth required; route exists)" -ForegroundColor Yellow
    $passed++
  } else {
    Write-Host "??  GET /api/cfo-dashboard/scenarios -> $($r.StatusCode)" -ForegroundColor Yellow
    $passed++
  }
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 401) {
    Write-Host "OK  GET /api/cfo-dashboard/scenarios -> 401 (auth required; route exists)" -ForegroundColor Yellow
    $passed++
  } else {
    Write-Host "FAIL GET /api/cfo-dashboard/scenarios -> $($_.Exception.Message)" -ForegroundColor Red
    $failed++
  }
}

Write-Host ""
Write-Host "Result: $passed passed/ok, $failed failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
exit $failed
