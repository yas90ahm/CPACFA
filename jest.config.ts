import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  // Canonical product gate: adapter contracts plus the governed Canadian ASPE
  // close, runbook, memory, orchestration, and ERP writeback paths. The other
  // tests remain available through explicit Jest path selection but are not
  // presented as the default product gate.
  testMatch: [
    '**/tests/adapters/**/*.test.ts',
    '**/tests/unit/accounting_memory_service.test.ts',
    '**/tests/unit/ai_boundary.test.ts',
    '**/tests/unit/canadian_aspe_close_profile.test.ts',
    '**/tests/unit/close_cycle_schedule.test.ts',
    '**/tests/unit/close_cycle_scheduler.test.ts',
    '**/tests/unit/close_orchestrator_service.test.ts',
    '**/tests/unit/close_cycle_orchestrator_preflight.test.ts',
    '**/tests/unit/erp_writeback_close_gate_service.test.ts',
    '**/tests/unit/erp_writeback_scheduler.test.ts',
    '**/tests/unit/journal_entry_erp_writeback.test.ts',
    '**/tests/unit/runbook_agent_service.test.ts',
    '**/tests/unit/runbook_compiler.test.ts',
    '**/tests/unit/runbook_file_parser.test.ts',
    '**/tests/unit/runbook_readiness_service.test.ts',
  ],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.test.json',
      diagnostics: { ignoreDiagnostics: [151002] },
    }],
  },
};

export default config;
