// =============================================================================
// CSV export
//
// RFC 4180-compliant CSV serializer. Emits Excel-friendly output with:
//   - CRLF line endings (Excel's default; many tools handle LF too)
//   - Cell quoting on `"`, `,`, CR, LF, leading/trailing whitespace
//   - Doubled inner quotes (`"` → `""`)
//   - BOM prefix opt-in for Excel UTF-8 detection
//   - Date.toISOString() default format; user can override per-column
//
// Zero runtime dependencies. Streams via a simple string concat — for
// 100k-row workloads this is fast enough; for >1M rows wire a
// ReadableStream-based streamer in v0.0.5.
// =============================================================================

import type { ExportColumn, ExportRow } from './types';

export interface ExportToCsvOptions {
  /** Field separator. Default `,`. Use `;` for some European locales. */
  readonly delimiter?: string;
  /** Line ending. Default `\r\n` (Excel-friendly). */
  readonly newline?: '\r\n' | '\n';
  /** Prefix the output with a UTF-8 BOM. Default `false`. */
  readonly bom?: boolean;
  /** Skip the header row. Default `false`. */
  readonly omitHeader?: boolean;
  /**
   * If true, blank rows (every cell empty) are emitted; otherwise skipped.
   * Default `true`.
   */
  readonly emitEmptyRows?: boolean;
}

export function exportToCsv<TRow extends ExportRow>(
  rows: ReadonlyArray<TRow>,
  columns: ReadonlyArray<ExportColumn>,
  options: ExportToCsvOptions = {},
): string {
  const sep = options.delimiter ?? ',';
  const nl = options.newline ?? '\r\n';
  const lines: string[] = [];

  if (!options.omitHeader) {
    lines.push(columns.map((c) => escapeCell(c.header ?? c.id, sep)).join(sep));
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const cells: string[] = [];
    let allEmpty = true;
    for (const col of columns) {
      const raw = row[col.id];
      const formatted = col.format
        ? col.format(raw, i)
        : stringifyValue(raw);
      if (formatted !== '') allEmpty = false;
      cells.push(escapeCell(formatted, sep));
    }
    if (!allEmpty || options.emitEmptyRows !== false) {
      lines.push(cells.join(sep));
    }
  }

  const body = lines.join(nl);
  return options.bom ? `\uFEFF${body}` : body;
}

/**
 * Trigger a browser download of CSV-formatted rows. Returns the Blob URL
 * for callers who want to revoke it manually; the auto-revoke heuristic
 * runs after 60 s.
 */
export function downloadCsv<TRow extends ExportRow>(
  rows: ReadonlyArray<TRow>,
  columns: ReadonlyArray<ExportColumn>,
  filename: string,
  options?: ExportToCsvOptions,
): string {
  if (typeof document === 'undefined') {
    throw new Error('@onegrid/export downloadCsv: requires a browser document.');
  }
  const csv = exportToCsv(rows, columns, options);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
  return url;
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean') {
    return String(v);
  }
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function escapeCell(value: string, sep: string): string {
  if (value === '') return '';
  const needsQuoting =
    value.includes(sep) ||
    value.includes('"') ||
    value.includes('\r') ||
    value.includes('\n') ||
    value.startsWith(' ') ||
    value.endsWith(' ');
  if (!needsQuoting) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
