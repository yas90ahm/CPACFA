/**
 * AI Module Imports — Verify AI modules do not import mutation-capable code.
 * AI must be advisory-only; no protocol_bridge, no db repositories (except ai_call_log).
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const SRC_AI = path.join(process.cwd(), 'src', 'ai');
const SRC_LLM = path.join(process.cwd(), 'src', 'llm');

const FORBIDDEN_IMPORTS = [
  'protocol_bridge',
  'bridge/index',
  'bridge/protocol_bridge',
  'db/index',
  'db/repositories/close_session_repository',
  'db/repositories/ledger_snapshot_repository',
  'db/repositories/audit_ledger_repository',
  'db/repositories/certification_artifact_repository',
  'services/close_session_service',
  'services/ledger_snapshot_service',
  'services/audit_ledger_service',
];

function getTsFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
      files.push(...getTsFiles(full));
    } else if (e.isFile() && (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts'))) {
      files.push(full);
    }
  }
  return files;
}

function checkFileForForbiddenImports(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations: string[] = [];
  for (const forbidden of FORBIDDEN_IMPORTS) {
    const patterns = [
      new RegExp(`from ['"].*${forbidden.replace(/\//g, '[/\\\\]')}['"]`),
      new RegExp(`import\\(['"].*${forbidden.replace(/\//g, '[/\\\\]')}['"]\\)`),
    ];
    for (const p of patterns) {
      if (p.test(content)) {
        violations.push(`${path.relative(process.cwd(), filePath)}: imports ${forbidden}`);
      }
    }
  }
  return violations;
}

describe('AI module imports', () => {
  it('ai/ modules do not import protocol_bridge or mutation repositories', () => {
    const files = getTsFiles(SRC_AI);
    const violations: string[] = [];
    for (const f of files) {
      // ai_call_log_repository is allowed to use pg Pool (advisory storage)
      if (f.includes('ai_call_log_repository')) continue;
      violations.push(...checkFileForForbiddenImports(f));
    }
    expect(violations).toEqual([]);
  });

  it('llm/ modules do not import protocol_bridge or mutation repositories', () => {
    const files = getTsFiles(SRC_LLM);
    const violations: string[] = [];
    for (const f of files) {
      violations.push(...checkFileForForbiddenImports(f));
    }
    expect(violations).toEqual([]);
  });
});
