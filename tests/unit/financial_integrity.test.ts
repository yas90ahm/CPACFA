/**
 * Financial integrity: Decimal.js usage, no Number() on financial paths,
 * normalizeMoney determinism, round2 correctness.
 */

import assert from 'node:assert/strict';
import { from, round2, sumRound2, minus, plus, mul, div, normalizeMoney } from '../../src/utils/decimal.js';
import Decimal from 'decimal.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

describe('financial integrity — Decimal.js', () => {
  it('from() creates Decimal from string without float loss', () => {
    const d = from('0.1');
    assert.ok(d instanceof Decimal);
    assert.equal(d.toString(), '0.1');
  });

  it('from() creates Decimal from number', () => {
    const d = from(123.45);
    assert.equal(d.toNumber(), 123.45);
  });

  it('from() passes through existing Decimal', () => {
    const d1 = new Decimal('99.99');
    const d2 = from(d1);
    assert.equal(d2, d1);
  });

  it('round2 rounds to 2 decimal places', () => {
    assert.equal(round2('1234.5678'), 1234.57);
    assert.equal(round2(0), 0);
  });

  it('sumRound2 sums with decimal precision', () => {
    assert.equal(sumRound2([0.1, 0.2]), 0.3);
    assert.equal(sumRound2([]), 0);
    assert.equal(sumRound2([100.01, 200.02, 300.03]), 600.06);
  });

  it('minus subtracts with precision', () => {
    assert.equal(minus(1000, 999.99), 0.01);
    assert.equal(minus('500.50', '250.25'), 250.25);
  });

  it('plus adds with precision', () => {
    assert.equal(plus(0.1, 0.2), 0.3);
    assert.equal(plus('100.01', '200.02'), 300.03);
  });

  it('mul multiplies with precision', () => {
    assert.equal(mul(100, 0.07), 7);
    assert.equal(mul('1000', '0.21'), 210);
  });

  it('div divides with precision', () => {
    assert.equal(div(100, 3), 33.33);
    assert.equal(div('1000', '7'), 142.86);
  });

  it('div handles division by zero gracefully', () => {
    assert.equal(div(100, 0), 0);
  });

  it('normalizeMoney produces canonical 2-decimal strings', () => {
    assert.equal(normalizeMoney(0.1 + 0.2), '0.30');
    assert.equal(normalizeMoney(0.3), '0.30');
    assert.equal(normalizeMoney(1000), '1000.00');
    assert.equal(normalizeMoney(null), '0.00');
    assert.equal(normalizeMoney(undefined), '0.00');
    assert.equal(normalizeMoney(''), '0.00');
  });

  it('normalizeMoney: 0.1+0.2 and 0.3 produce identical strings', () => {
    assert.equal(normalizeMoney(0.1 + 0.2), normalizeMoney(0.3));
  });

  it('normalizeMoney handles NaN/Infinity', () => {
    assert.equal(normalizeMoney(NaN), '0.00');
    assert.equal(normalizeMoney(Infinity), '0.00');
  });
});

describe('financial integrity — no Number() on financial paths', () => {
  it('cpa_decision_handler uses decFrom instead of Number()', () => {
    const filePath = resolve(__dirname, '../../src/services/cpa_decision_handler.ts');
    const content = readFileSync(filePath, 'utf-8');
    const numberParamMatches = content.match(/Number\(params\./g);
    assert.equal(numberParamMatches, null, 'No raw Number(params.*) calls should remain');
  });
});
