// =============================================================================
// XLSX export
//
// SheetJS-backed export. SheetJS (`xlsx`) is a peer dependency, declared
// optional — installing oneGrid doesn't pull SheetJS unless the consumer
// also installs it. This keeps the default install lean (~~120 KB) while
// putting Excel export at consumer fingertips.
//
// Implementation strategy: dynamic import of `xlsx` at call time. If the
// peer isn't installed, throw a friendly error pointing the consumer at
// the install command — no other path needs to know SheetJS even exists.
// =============================================================================

import type * as XLSX from 'xlsx';
import type { ExportColumn, ExportRow } from './types';

export interface ExportToXlsxOptions {
  /** Sheet name inside the workbook. Default 'Sheet1'. */
  readonly sheetName?: string;
  /** Skip the header row. Default `false`. */
  readonly omitHeader?: boolean;
  /** Optional book-level metadata (title, author, etc). */
  readonly meta?: {
    readonly title?: string;
    readonly author?: string;
    readonly subject?: string;
  };
  /**
   * Column widths in approximate character units. Defaults to a reasonable
   * width derived from the header length.
   */
  readonly columnWidths?: ReadonlyArray<number>;
}

export interface XlsxBlob {
  /** Bytes of the .xlsx file. Hand to a Blob/Buffer/file write. */
  readonly bytes: Uint8Array;
  /** MIME type for browser downloads. */
  readonly mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  /** Suggested file extension. */
  readonly extension: '.xlsx';
}

/**
 * Generate an XLSX byte buffer for the given rows and columns. Throws a
 * helpful error if `xlsx` (SheetJS) isn't installed.
 */
export async function exportToXlsx<TRow extends ExportRow>(
  rows: ReadonlyArray<TRow>,
  columns: ReadonlyArray<ExportColumn>,
  options: ExportToXlsxOptions = {},
): Promise<XlsxBlob> {
  const xlsx = await loadXlsxModule();

  // Build a flat 2D array: header row + data rows.
  const aoa: unknown[][] = [];
  if (!options.omitHeader) {
    aoa.push(columns.map((c) => c.header ?? c.id));
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const cells = columns.map((col) => {
      const raw = row[col.id];
      if (col.format) return col.format(raw, i);
      // Preserve numbers/dates/booleans as typed values for XLSX cell types.
      return raw;
    });
    aoa.push(cells);
  }

  const sheet = xlsx.utils.aoa_to_sheet(aoa);

  // Apply column widths.
  const widths =
    options.columnWidths ?? columns.map((c) => Math.max(8, (c.header ?? c.id).length + 2));
  sheet['!cols'] = widths.map((w) => ({ wch: w }));

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, options.sheetName ?? 'Sheet1');

  if (options.meta) {
    const props: Record<string, string> = {};
    if (options.meta.title !== undefined) props['Title'] = options.meta.title;
    if (options.meta.author !== undefined) props['Author'] = options.meta.author;
    if (options.meta.subject !== undefined) props['Subject'] = options.meta.subject;
    workbook.Props = props as XLSX.FullProperties;
  }

  // SheetJS' `write` overloads thread `type: 'array'` as an array-like of
  // bytes; cast through unknown to sidestep its union-typed return.
  const raw = xlsx.write(workbook, { type: 'array', bookType: 'xlsx' }) as unknown as
    | ArrayBuffer
    | Uint8Array
    | ArrayLike<number>;
  const bytes =
    raw instanceof Uint8Array
      ? raw
      : raw instanceof ArrayBuffer
        ? new Uint8Array(raw)
        : Uint8Array.from(raw as ArrayLike<number>);
  return {
    bytes,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: '.xlsx',
  };
}

/**
 * Browser convenience: generate XLSX and trigger a download.
 */
export async function downloadXlsx<TRow extends ExportRow>(
  rows: ReadonlyArray<TRow>,
  columns: ReadonlyArray<ExportColumn>,
  filename: string,
  options?: ExportToXlsxOptions,
): Promise<string> {
  if (typeof document === 'undefined') {
    throw new Error('@onegrid/export downloadXlsx: requires a browser document.');
  }
  const result = await exportToXlsx(rows, columns, options);
  // Cast through ArrayBuffer narrows the buffer's union type for Blob's
  // BlobPart constraint (Uint8Array<ArrayBufferLike> includes SAB).
  const blob = new Blob([result.bytes.buffer as ArrayBuffer], { type: result.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}${result.extension}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
  return url;
}

async function loadXlsxModule(): Promise<typeof XLSX> {
  try {
    // Dynamic import erases the module reference if `xlsx` isn't installed
    // (TS keeps the type via `import type` above, which compiles to nothing).
    return (await import(/* @vite-ignore */ 'xlsx')) as typeof XLSX;
  } catch (err) {
    throw new Error(
      '@onegrid/export: xlsx (SheetJS) is required for XLSX export. ' +
        "Install it with `npm install xlsx` (it's a peer dependency).\n" +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
