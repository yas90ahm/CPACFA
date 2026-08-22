import { describe, expect, it } from '@jest/globals';
import { detectRunbookSourceFormat, parseRunbookFile } from '../../src/services/runbook_file_parser.js';

describe('runbook file parser', () => {
  it('normalizes CSV headers and retains source row references', async () => {
    const source = Buffer.from([
      'Task Code,Task Name,Owner,Depends On',
      'TB_LOAD,Load the trial balance,Senior Accountant,',
      'BANK_REC,Reconcile bank accounts,Controller,TB_LOAD',
    ].join('\n'));

    const result = await parseRunbookFile({
      buffer: source,
      filename: 'monthly-close.csv',
      mimeType: 'text/csv',
    });

    expect(result.format).toBe('csv');
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0]).toEqual(expect.objectContaining({
      sourceReference: 'CSV:2',
      values: expect.objectContaining({ 'task code': 'TB_LOAD', 'task name': 'Load the trial balance' }),
    }));
  });

  it('accepts a JSON object with a tasks array', async () => {
    const result = await parseRunbookFile({
      buffer: Buffer.from(JSON.stringify({ tasks: [{ task: 'Review material variances', reviewer: 'Controller' }] })),
      filename: 'quarter-close.json',
      mimeType: 'application/json',
    });

    expect(result.tasks[0]?.values.task).toBe('Review material variances');
    expect(result.tasks[0]?.sourceReference).toBe('JSON:2');
  });

  it('rejects unsupported and legacy spreadsheet formats explicitly', () => {
    expect(() => detectRunbookSourceFormat('runbook.xls', 'application/vnd.ms-excel')).toThrow(/not supported/i);
    expect(() => detectRunbookSourceFormat('runbook.exe', 'application/octet-stream')).toThrow(/unsupported/i);
  });
});
