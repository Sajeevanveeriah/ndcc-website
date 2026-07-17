// CSV encoding helpers with spreadsheet-formula-injection protection.
//
// Every cell goes through csvCell(): values whose first character is one of
// = + - @ (or a control character Excel treats as a formula trigger) are
// prefixed with a leading apostrophe so spreadsheet applications render them
// as text instead of executing them. Quoting follows RFC 4180 (double
// quotes, doubled inner quotes) and covers commas, quotes, and newlines.

const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r']);

export function guardFormulaInjection(value: string): string {
  if (value.length === 0) return value;
  if (FORMULA_TRIGGERS.has(value[0])) return `'${value}`;
  return value;
}

export function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const guarded = guardFormulaInjection(raw);
  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

export function toCsv(rows: Array<Array<unknown>>): string {
  // BOM so Excel opens UTF-8 (accented names, crème, etc.) correctly.
  return '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
