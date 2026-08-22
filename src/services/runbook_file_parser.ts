import { extname } from 'path';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type {
  ParsedRunbookSource,
  ParsedRunbookTask,
  RunbookSourceFormat,
} from '../types/close_runbook.js';

const MAX_RUNBOOK_TASKS = 500;
const MAX_TEXT_LENGTH = 2_000_000;
const MAX_ARCHIVE_ENTRIES = 2_000;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

const HEADER_HINTS = new Set([
  'task', 'task name', 'step', 'activity', 'procedure', 'description',
  'owner', 'assignee', 'reviewer', 'approver', 'dependency', 'dependencies',
  'predecessor', 'due', 'due date', 'due offset', 'evidence', 'support',
  'input', 'output', 'control', 'control code', 'frequency', 'tolerance',
]);

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');
}

function normalizeCellValue(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (Array.isArray(object.richText)) {
      return object.richText
        .map((part) => typeof part === 'object' && part != null ? String((part as Record<string, unknown>).text ?? '') : '')
        .join('')
        .trim();
    }
    if (object.result != null) return normalizeCellValue(object.result);
    if (object.text != null) return normalizeCellValue(object.text);
    if (object.hyperlink != null) return normalizeCellValue(object.hyperlink);
  }
  return String(value).trim();
}

function recordsToTasks(
  records: Record<string, unknown>[],
  sourcePrefix: string
): ParsedRunbookTask[] {
  return records
    .map((record, index) => {
      const values: Record<string, string> = {};
      for (const [key, value] of Object.entries(record)) {
        const normalizedKey = normalizeHeader(key);
        if (!normalizedKey) continue;
        values[normalizedKey] = normalizeCellValue(value);
      }
      return { sourceReference: `${sourcePrefix}:${index + 2}`, values };
    })
    .filter((row) => Object.values(row.values).some((value) => value.length > 0));
}

function scoreHeaderRow(cells: unknown[]): number {
  return cells.reduce<number>((score, cell) => {
    const normalized = normalizeHeader(normalizeCellValue(cell));
    if (!normalized) return score;
    if (HEADER_HINTS.has(normalized)) return score + 3;
    return score + ([...HEADER_HINTS].some((hint) => normalized.includes(hint)) ? 1 : 0);
  }, 0);
}

function worksheetRows(worksheet: ExcelJS.Worksheet): unknown[][] {
  const rows: unknown[][] = [];
  const boundedRowCount = Math.min(worksheet.rowCount, MAX_RUNBOOK_TASKS + 26);
  for (let rowNumber = 1; rowNumber <= boundedRowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = row.values as unknown[];
    rows.push(values.slice(1));
  }
  return rows;
}

function tasksFromWorksheet(worksheet: ExcelJS.Worksheet): ParsedRunbookTask[] {
  const rows = worksheetRows(worksheet);
  if (rows.length === 0) return [];
  const limit = Math.min(rows.length, 25);
  let headerIndex = 0;
  let bestScore = -1;
  for (let index = 0; index < limit; index += 1) {
    const score = scoreHeaderRow(rows[index] ?? []);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = index;
    }
  }
  const header = (rows[headerIndex] ?? []).map((cell, index) => {
    const normalized = normalizeHeader(normalizeCellValue(cell));
    return normalized || `column ${index + 1}`;
  });
  const tasks: ParsedRunbookTask[] = [];
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const values: Record<string, string> = {};
    for (let columnIndex = 0; columnIndex < header.length; columnIndex += 1) {
      values[header[columnIndex]!] = normalizeCellValue(row[columnIndex]);
    }
    if (Object.values(values).some((value) => value.length > 0)) {
      tasks.push({
        sourceReference: `${worksheet.name || 'Sheet 1'}:${rowIndex + 1}`,
        values,
      });
    }
  }
  return tasks;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)));
}

function textToTasks(text: string, sourcePrefix: string): ParsedRunbookTask[] {
  const normalized = text.slice(0, MAX_TEXT_LENGTH).replace(/\r/g, '');
  const lines = normalized
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]+|\d+[.)]|[A-Za-z][.)])\s*/, '').trim())
    .filter((line) => line.length >= 3)
    .filter((line) => !/^(table of contents|contents|month[- ]end close|quarter[- ]end close|runbook)$/i.test(line));

  return lines.slice(0, MAX_RUNBOOK_TASKS + 1).map<ParsedRunbookTask>((line, index) => {
    const tabParts = line.split(/\t+|\s{3,}/).map((part) => part.trim()).filter(Boolean);
    if (tabParts.length >= 2) {
      return {
        sourceReference: `${sourcePrefix}:${index + 1}`,
        values: {
          task: tabParts[0]!,
          description: tabParts.slice(1).join(' | '),
        },
      };
    }
    return {
      sourceReference: `${sourcePrefix}:${index + 1}`,
      values: { task: line } as Record<string, string>,
    };
  });
}

export function detectRunbookSourceFormat(filename: string, mimeType: string): RunbookSourceFormat {
  const extension = extname(filename).toLowerCase();
  const mime = mimeType.toLowerCase().split(';')[0]!.trim();
  if (extension === '.csv' || mime === 'text/csv') return 'csv';
  if (extension === '.xls') {
    throw new Error('Legacy .xls files are not supported. Save the runbook as .xlsx or CSV.');
  }
  if (extension === '.xlsx' || mime.includes('spreadsheet')) return 'xlsx';
  if (extension === '.json' || mime === 'application/json') return 'json';
  if (extension === '.pdf' || mime === 'application/pdf') return 'pdf';
  if (extension === '.docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (extension === '.txt' || extension === '.md' || mime.startsWith('text/')) return 'text';
  throw new Error('Unsupported runbook type. Use CSV, XLSX, JSON, TXT, PDF, or DOCX.');
}

async function parsePdf(buffer: Buffer): Promise<ParsedRunbookTask[]> {
  const module = await import('pdf-parse');
  const parser = (module.default ?? module) as unknown as (input: Buffer) => Promise<{ text?: string }>;
  const result = await parser(buffer);
  return textToTasks(result.text ?? '', 'PDF');
}

async function loadBoundedOfficeArchive(buffer: Buffer): Promise<JSZip> {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error('Office runbook contains too many archive entries to compile safely.');
  }
  const uncompressedBytes = entries.reduce((total, entry) => {
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    return total + size;
  }, 0);
  if (uncompressedBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
    throw new Error('Office runbook expands beyond the safe compilation limit.');
  }
  return zip;
}

async function parseDocx(buffer: Buffer): Promise<ParsedRunbookTask[]> {
  const zip = await loadBoundedOfficeArchive(buffer);
  const document = zip.file('word/document.xml');
  if (!document) throw new Error('DOCX does not contain word/document.xml');
  const uncompressedSize = (document as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
  if (uncompressedSize != null && uncompressedSize > MAX_TEXT_LENGTH * 2) {
    throw new Error('DOCX runbook text is too large to compile safely.');
  }
  const xml = await document.async('string');
  const text = decodeXml(
    xml
      .replace(/<w:tab\s*\/>/g, '\t')
      .replace(/<w:br\s*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
  );
  return textToTasks(text, 'DOCX');
}

export async function parseRunbookFile(input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<ParsedRunbookSource> {
  const format = detectRunbookSourceFormat(input.filename, input.mimeType);
  let tasks: ParsedRunbookTask[] = [];
  const warnings: string[] = [];

  if (format === 'csv') {
    const records = parse(input.buffer.toString('utf8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
      to_line: MAX_RUNBOOK_TASKS + 2,
    }) as Record<string, unknown>[];
    tasks = recordsToTasks(records, 'CSV');
  } else if (format === 'xlsx') {
    await loadBoundedOfficeArchive(input.buffer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(input.buffer as unknown as ArrayBuffer);
    for (const worksheet of workbook.worksheets) {
      tasks.push(...tasksFromWorksheet(worksheet));
      if (tasks.length > MAX_RUNBOOK_TASKS) break;
    }
  } else if (format === 'json') {
    const parsed = JSON.parse(input.buffer.toString('utf8')) as unknown;
    const rows = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed != null && Array.isArray((parsed as Record<string, unknown>).tasks)
        ? (parsed as { tasks: unknown[] }).tasks
        : [];
    if (!rows.every((row) => typeof row === 'object' && row != null && !Array.isArray(row))) {
      throw new Error('JSON runbook must be an array of task objects or an object with a tasks array.');
    }
    tasks = recordsToTasks((rows as Record<string, unknown>[]).slice(0, MAX_RUNBOOK_TASKS + 1), 'JSON');
  } else if (format === 'pdf') {
    tasks = await parsePdf(input.buffer);
  } else if (format === 'docx') {
    tasks = await parseDocx(input.buffer);
  } else {
    tasks = textToTasks(input.buffer.toString('utf8'), 'TEXT');
  }

  const sourceRowCount = tasks.length;
  const ignoredRowCount = Math.max(0, sourceRowCount - MAX_RUNBOOK_TASKS);
  if (ignoredRowCount > 0) {
    warnings.push(`Only the first ${MAX_RUNBOOK_TASKS} executable rows were compiled.`);
    tasks = tasks.slice(0, MAX_RUNBOOK_TASKS);
  }
  return { format, tasks, sourceRowCount, ignoredRowCount, warnings };
}
