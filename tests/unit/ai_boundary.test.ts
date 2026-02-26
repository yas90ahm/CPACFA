/**
 * AI Boundary — Runtime guard that AI cannot invoke mutation paths.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  enterAdvisoryContext,
  exitAdvisoryContext,
  assertNoAiMutationContext,
  resetAiBoundaryForTests,
} from '../../src/lib/ai_boundary.js';
import { resetModeCache } from '../../src/lib/runtime_mode.js';

describe('AI boundary', () => {
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

  it('assertNoAiMutationContext does not throw in dev when not in advisory context', () => {
    process.env.MODE = 'dev';
    resetModeCache();
    expect(() => assertNoAiMutationContext()).not.toThrow();
  });

  it('assertNoAiMutationContext does not throw in prod when not in advisory context', () => {
    process.env.MODE = 'prod';
    resetModeCache();
    expect(() => assertNoAiMutationContext()).not.toThrow();
  });

  it('assertNoAiMutationContext throws in prod when inside advisory context', () => {
    process.env.MODE = 'prod';
    resetModeCache();
    enterAdvisoryContext();
    try {
      expect(() => assertNoAiMutationContext()).toThrow(/AI_BOUNDARY.*Mutation path cannot be invoked from AI context/);
    } finally {
      exitAdvisoryContext();
    }
  });

  it('exitAdvisoryContext balances enterAdvisoryContext', () => {
    process.env.MODE = 'prod';
    resetModeCache();
    enterAdvisoryContext();
    exitAdvisoryContext();
    expect(() => assertNoAiMutationContext()).not.toThrow();
  });

  it('nested enter/exit advisory context', () => {
    process.env.MODE = 'prod';
    resetModeCache();
    enterAdvisoryContext();
    enterAdvisoryContext();
    expect(() => assertNoAiMutationContext()).toThrow(/AI_BOUNDARY/);
    exitAdvisoryContext();
    expect(() => assertNoAiMutationContext()).toThrow(/AI_BOUNDARY/);
    exitAdvisoryContext();
    expect(() => assertNoAiMutationContext()).not.toThrow();
  });
});
