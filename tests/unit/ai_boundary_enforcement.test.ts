/**
 * AI boundary enforcement: AI advisory context cannot invoke mutation paths.
 */

import assert from 'node:assert/strict';
import {
  enterAdvisoryContext,
  exitAdvisoryContext,
  assertNoAiMutationContext,
  runInBoundaryScope,
  resetAiBoundaryForTests,
} from '../../src/lib/ai_boundary.js';

describe('AI boundary — enforcement layers', () => {
  beforeEach(() => {
    resetAiBoundaryForTests();
  });

  afterEach(() => {
    resetAiBoundaryForTests();
  });

  it('enterAdvisoryContext increments depth, assertNoAiMutationContext throws', () => {
    runInBoundaryScope(() => {
      enterAdvisoryContext();
      assert.throws(() => assertNoAiMutationContext(), /AI_BOUNDARY/);
      exitAdvisoryContext();
    });
  });

  it('assertNoAiMutationContext passes outside advisory context', () => {
    runInBoundaryScope(() => {
      assert.doesNotThrow(() => assertNoAiMutationContext());
    });
  });

  it('assertNoAiMutationContext throws inside advisory context', () => {
    runInBoundaryScope(() => {
      enterAdvisoryContext();
      try {
        assert.throws(
          () => assertNoAiMutationContext(),
          /Mutation path cannot be invoked from AI context/
        );
      } finally {
        exitAdvisoryContext();
      }
    });
  });

  it('runInBoundaryScope isolates per-request', () => {
    let outerThrew = false;
    let innerThrew = false;

    runInBoundaryScope(() => {
      enterAdvisoryContext();
      runInBoundaryScope(() => {
        try {
          assertNoAiMutationContext();
        } catch {
          innerThrew = true;
        }
      });
      try {
        assertNoAiMutationContext();
      } catch {
        outerThrew = true;
      }
      exitAdvisoryContext();
    });

    assert.equal(innerThrew, false);
    assert.equal(outerThrew, true);
  });

  it('nested advisory contexts require matching exits', () => {
    runInBoundaryScope(() => {
      enterAdvisoryContext();
      enterAdvisoryContext();
      exitAdvisoryContext();
      assert.throws(() => assertNoAiMutationContext(), /AI_BOUNDARY/);
      exitAdvisoryContext();
      assert.doesNotThrow(() => assertNoAiMutationContext());
    });
  });

  it('exitAdvisoryContext below zero does not break', () => {
    runInBoundaryScope(() => {
      exitAdvisoryContext();
      assert.doesNotThrow(() => assertNoAiMutationContext());
    });
  });

  it('error message includes clear guidance', () => {
    runInBoundaryScope(() => {
      enterAdvisoryContext();
      try {
        assertNoAiMutationContext();
        assert.fail('should have thrown');
      } catch (e) {
        assert.ok((e as Error).message.includes('advisory-only'));
        assert.ok((e as Error).message.includes('must not mutate'));
      }
      exitAdvisoryContext();
    });
  });
});

describe('AI boundary — guardrail file exists', () => {
  it('proposal_validator module exports assertNoNumericAmountsInAgentOutput', async () => {
    const mod = await import('../../src/ai/guardrails/proposal_validator.js');
    assert.equal(typeof mod.assertNoNumericAmountsInAgentOutput, 'function');
  });
});
