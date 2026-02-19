/**
 * AI Guardrail Enforcement Tests
 *
 * Verifies that:
 * 1. assertNoNumericAmountsInAgentOutput catches dollar amounts in AI output
 * 2. assertNoNumericAmountsInAgentOutput allows non-financial numbers (confidence, account_code)
 * 3. assertNoAiMutationContext rejects mutation when in AI context (bridge guard)
 * 4. Agentic services that return structured data apply the guardrail (service scan)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { assertNoNumericAmountsInAgentOutput } from '../../src/llm/guardrails.js';
import {
  enterAdvisoryContext,
  exitAdvisoryContext,
  assertNoAiMutationContext,
  resetAiBoundaryForTests,
} from '../../src/lib/ai_boundary.js';
import { resetModeCache } from '../../src/lib/runtime_mode.js';
import fs from 'fs';
import path from 'path';

describe('AI Guardrail Enforcement', () => {
  describe('assertNoNumericAmountsInAgentOutput', () => {
    it('throws when AI response contains amount field with number', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ amount: 5000.0 }, 'test')
      ).toThrow(/Scope violation.*numeric amounts/);
    });

    it('throws when AI response contains debit/credit with numbers', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput(
          { debits: [{ account: 'Cash', amount: 100 }], credits: [{ account: 'Revenue', amount: 100 }] },
          'test'
        )
      ).toThrow(/Scope violation.*numeric amounts/);
    });

    it('allows confidence (metadata)', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ confidence: 0.94, type: 'classification' }, 'test')
      ).not.toThrow();
    });

    it('allows account_code as identifier (string)', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ account_code: '4010', accountName: 'Revenue' }, 'test')
      ).not.toThrow();
    });

    it('allows response with only allowed keys', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput(
          { classification: 'trial_balance', confidence: 0.9, rationale: 'Headers match' },
          'test'
        )
      ).not.toThrow();
    });
  });

  describe('Bridge rejects AI context', () => {
    const originalMode = process.env.MODE;

    beforeEach(() => {
      resetAiBoundaryForTests();
      resetModeCache();
    });

    afterEach(() => {
      resetAiBoundaryForTests();
      if (originalMode !== undefined) process.env.MODE = originalMode;
      else delete process.env.MODE;
    });

    it('assertNoAiMutationContext throws in prod when inside advisory context', () => {
      process.env.MODE = 'prod';
      resetModeCache();
      enterAdvisoryContext();
      try {
        expect(() => assertNoAiMutationContext()).toThrow(/AI_BOUNDARY|Mutation path cannot be invoked from AI context/);
      } finally {
        exitAdvisoryContext();
      }
    });
  });

  describe('Agentic services apply guardrail (source scan)', () => {
    const servicesThatMustHaveGuardrail = [
      'agentic_account_classifier',
      'agentic_ingestion_classifier',
      'agentic_je_suggestions',
      'agentic_ar_ap_workflows',
      'accrual_deferral_service',
      'agentic_materiality_suggestion',
      'agentic_bank_feed_matching',
      'agentic_bank_rec_service',
      'agentic_ledger_to_tb',
      'invoice_to_books_service',
    ];

    it('each listed agentic service file contains assertNoNumericAmountsInAgentOutput', () => {
      const srcDir = path.resolve(__dirname, '../../src/services');
      const missing: string[] = [];

      for (const name of servicesThatMustHaveGuardrail) {
        const fileName = name.includes('_') ? `${name}.ts` : `${name}.ts`;
        const filePath = path.join(srcDir, fileName);
        if (!fs.existsSync(filePath)) {
          missing.push(`${fileName} (file not found)`);
          continue;
        }
        const content = fs.readFileSync(filePath, 'utf8');
        if (!content.includes('assertNoNumericAmountsInAgentOutput')) {
          missing.push(fileName);
        }
      }

      expect(missing).toEqual([]);
    });
  });
});
