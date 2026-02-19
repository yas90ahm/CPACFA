/**
 * Test deterministic pattern detection engine.
 * Run: npx tsx scripts/test_pattern_detection.ts
 */

import { detectPatterns, getSummary, getSuggestedQuestions } from '../src/services/deterministic_pattern_detector.js';
import type { ImbalancedEntry } from '../src/types/pattern_detection.js';

// Test Case 1: Single line entry
const singleLineEntry: ImbalancedEntry = {
  entry_id: 'TEST-001',
  entry_date: '2024-03-15',
  lines: [{ line_number: 1, account_code: '1500', debit: 25000, credit: 0, description: 'Equipment purchase' }],
  totalDebits: 25000,
  totalCredits: 0,
  imbalance: 25000,
};

console.log('TEST 1: Single Line Entry');
console.log('─'.repeat(50));
const result1 = detectPatterns(singleLineEntry);
console.log('Pattern:', result1.primary_pattern.pattern_id);
console.log('Confidence:', result1.primary_pattern.confidence);
console.log('Summary:', getSummary(result1));
console.log('Questions:', getSuggestedQuestions(result1));
console.log('Requires AI:', result1.requires_ai);
console.log('\n');

// Test Case 2: Small typo
const smallTypoEntry: ImbalancedEntry = {
  entry_id: 'TEST-002',
  entry_date: '2024-03-15',
  lines: [
    { line_number: 1, account_code: '1000', debit: 10000, credit: 0 },
    { line_number: 2, account_code: '4000', debit: 0, credit: 9500 },
  ],
  totalDebits: 10000,
  totalCredits: 9500,
  imbalance: 500,
};

console.log('TEST 2: Small Typo');
console.log('─'.repeat(50));
const result2 = detectPatterns(smallTypoEntry);
console.log('Pattern:', result2.primary_pattern.pattern_id);
console.log('Confidence:', result2.primary_pattern.confidence);
console.log('Summary:', getSummary(result2));
console.log('Questions:', getSuggestedQuestions(result2));
console.log('Requires AI:', result2.requires_ai);
console.log('\n');

// Test Case 3: Round imbalance
const roundImbalanceEntry: ImbalancedEntry = {
  entry_id: 'TEST-003',
  entry_date: '2024-03-15',
  lines: [
    { line_number: 1, account_code: '1500', debit: 25000, credit: 0 },
    { line_number: 2, account_code: '1000', debit: 0, credit: 15000 },
  ],
  totalDebits: 25000,
  totalCredits: 15000,
  imbalance: 10000,
};

console.log('TEST 3: Round Imbalance');
console.log('─'.repeat(50));
const result3 = detectPatterns(roundImbalanceEntry);
console.log('Pattern:', result3.primary_pattern.pattern_id);
console.log('Confidence:', result3.primary_pattern.confidence);
console.log('Summary:', getSummary(result3));
console.log('Questions:', getSuggestedQuestions(result3));
console.log('Requires AI:', result3.requires_ai);
console.log('\n');

// Test Case 4: Duplicate amount
const duplicateEntry: ImbalancedEntry = {
  entry_id: 'TEST-004',
  entry_date: '2024-03-15',
  lines: [
    { line_number: 1, account_code: '1000', debit: 5000, credit: 0 },
    { line_number: 2, account_code: '4000', debit: 0, credit: 5000 },
    { line_number: 3, account_code: '4000', debit: 0, credit: 5000 }, // Duplicate
  ],
  totalDebits: 5000,
  totalCredits: 10000,
  imbalance: 5000,
};

console.log('TEST 4: Duplicate/Wrong Sign');
console.log('─'.repeat(50));
const result4 = detectPatterns(duplicateEntry);
console.log('Pattern:', result4.primary_pattern.pattern_id);
console.log('Confidence:', result4.primary_pattern.confidence);
console.log('Summary:', getSummary(result4));
console.log('Questions:', getSuggestedQuestions(result4));
console.log('Requires AI:', result4.requires_ai);
