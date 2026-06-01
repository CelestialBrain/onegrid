// =============================================================================
// Introspection + deferred stubs.
//
// Wave 14 (cell-metadata introspection): CELL / INFO / SHEET / SHEETS /
// FORMULATEXT / ISFORMULA / ISREF are real implementations. They read the
// per-call `CallContext` set by the evaluator, which carries the
// un-evaluated argument AST and the active resolver. Functions without
// access to those (GETPIVOTDATA / RTD / IMAGE / AREAS / CJK locale helpers)
// remain #NAME! deferrals.
//
// VALUETOTEXT / ARRAYTOTEXT are real implementations.
// =============================================================================

import type { FormulaNode } from '../ast';
import { NAME_ERROR, VALUE_ERROR, isFormulaError } from '../errors';
import { getCallContext, register, to2D } from './_shared';

function isCellRefNode(n: unknown): n is { kind: 'cellRef'; ref: string } {
  return typeof n === 'object' && n !== null && (n as { kind?: unknown }).kind === 'cellRef';
}

function isRangeRefNode(n: unknown): n is { kind: 'rangeRef'; ref: string } {
  return typeof n === 'object' && n !== null && (n as { kind?: unknown }).kind === 'rangeRef';
}

function nodeIsRef(n: unknown): boolean {
  return isCellRefNode(n) || isRangeRefNode(n);
}

// ----- AST text serializer (used by FORMULATEXT) ----------------------------

function serialize(node: FormulaNode): string {
  switch (node.kind) {
    case 'number':
      return String(node.value);
    case 'string':
      return `"${node.value.replace(/"/g, '""')}"`;
    case 'boolean':
      return node.value ? 'TRUE' : 'FALSE';
    case 'cellRef':
    case 'rangeRef':
      return node.ref;
    case 'percent':
      return `${serialize(node.operand)}%`;
    case 'unary':
      return `${node.op}${serialize(node.operand)}`;
    case 'binary':
      return `(${serialize(node.left)}${node.op}${serialize(node.right)})`;
    case 'call':
      return `${node.name.toUpperCase()}(${node.args.map(serialize).join(',')})`;
    case 'lambda':
      return `LAMBDA(${[...node.params, serialize(node.body)].join(',')})`;
    case 'spilledRef':
      return `${node.anchor}#`;
    case 'implicitIntersection':
      return `@${serialize(node.operand)}`;
    case 'tableRef':
      return serializeTableRef(node);
  }
}

function serializeTableRef(node: {
  table: string;
  column?: string;
  selector: 'all' | 'headers' | 'data' | 'totals' | 'thisRow';
}): string {
  const region: Record<typeof node.selector, string | null> = {
    all: '#All',
    headers: '#Headers',
    data: null,
    totals: '#Totals',
    thisRow: '#This Row',
  };
  const r = region[node.selector];
  if (node.selector === 'thisRow' && node.column) {
    return `${node.table}[@${node.column}]`;
  }
  if (r && node.column) return `${node.table}[[${r}],[${node.column}]]`;
  if (r) return `${node.table}[${r}]`;
  if (node.column) return `${node.table}[${node.column}]`;
  return `${node.table}[]`;
}

// ----- CELL ----------------------------------------------------------------
//
// CELL(info_type, [reference]). Excel returns metadata about the top-left
// cell of `reference`. We support the type strings whose meaning is
// well-defined without a host workbook:
//   "address"   — A1-style address with $ prefixes
//   "col"       — column number (1-based)
//   "row"       — row number (1-based)
//   "contents"  — the cell value
//   "type"      — "b" blank, "l" label (text), "v" value (number/bool)
//   "prefix"    — text alignment prefix character (empty for non-text)
//   "width"     — column width (we return the default)
//
// The other info_type values ("format", "color", "filename", "parentheses",
// "protect") need workbook-level metadata we don't expose; they return
// #N/A.

function parseA1(ref: string): { col: number; row: number } | undefined {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref);
  if (!m) return undefined;
  const letters = m[1]!;
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return { col, row: Number(m[2]) };
}

function colToLetters(col: number): string {
  let s = '';
  let n = col;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

register('CELL', (args) => {
  const infoType = typeof args[0] === 'string' ? args[0].toLowerCase() : '';
  const ctx = getCallContext();
  const refNode = ctx?.argNodes[1];
  // No reference given → operate on "the active cell"; we don't track that,
  // so the behavior degrades to #N/A.
  if (!refNode) return NAME_ERROR;
  const value = args[1];
  if (isCellRefNode(refNode)) {
    const parsed = parseA1(refNode.ref);
    switch (infoType) {
      case 'address':
        return parsed ? `$${colToLetters(parsed.col)}$${parsed.row}` : refNode.ref;
      case 'col':
        return parsed ? parsed.col : VALUE_ERROR;
      case 'row':
        return parsed ? parsed.row : VALUE_ERROR;
      case 'contents':
        return value ?? '';
      case 'type':
        if (value === null || value === undefined || value === '') return 'b';
        if (typeof value === 'string') return 'l';
        return 'v';
      case 'prefix':
        return '';
      case 'width':
        return 10; // documented default
      case 'format':
      case 'color':
      case 'filename':
      case 'parentheses':
      case 'protect':
        return NAME_ERROR;
      default:
        return VALUE_ERROR;
    }
  }
  if (isRangeRefNode(refNode)) {
    // For ranges Excel operates on the top-left cell. Extract that.
    const start = refNode.ref.split(':')[0]!;
    const parsed = parseA1(start);
    switch (infoType) {
      case 'address':
        return parsed ? `$${colToLetters(parsed.col)}$${parsed.row}` : start;
      case 'col':
        return parsed ? parsed.col : VALUE_ERROR;
      case 'row':
        return parsed ? parsed.row : VALUE_ERROR;
      default:
        return VALUE_ERROR;
    }
  }
  return VALUE_ERROR;
});

// ----- INFO -----------------------------------------------------------------
//
// INFO("info_type"). Excel returns host-environment metadata. We answer the
// host-independent values; "directory" / "memavail" / "memused" / "totmem"
// / "origin" / "recalc" return what makes sense for a browser/Node runtime.
register('INFO', (args) => {
  const infoType = typeof args[0] === 'string' ? args[0].toLowerCase() : '';
  switch (infoType) {
    case 'release':
      return '@onegrid/formula';
    case 'numfile':
      return 1;
    case 'osversion':
      return typeof navigator !== 'undefined' && 'userAgent' in navigator
        ? (navigator as { userAgent: string }).userAgent
        : typeof process !== 'undefined' && process.platform
          ? `${process.platform}-${process.version ?? ''}`
          : '';
    case 'system':
      return typeof navigator !== 'undefined' ? 'browser' : 'node';
    case 'recalc':
      return 'Automatic';
    case 'directory':
    case 'origin':
      return '';
    case 'memavail':
    case 'memused':
    case 'totmem':
      return 0;
    default:
      return VALUE_ERROR;
  }
});

// ----- SHEET / SHEETS -------------------------------------------------------
//
// No sheet model — single workbook with one implicit sheet. SHEET returns 1,
// SHEETS returns 1.
register('SHEET', () => 1);
register('SHEETS', () => 1);

// ----- FORMULATEXT ----------------------------------------------------------
//
// FORMULATEXT(reference). Excel returns the formula text of `reference` if
// that cell contains one; we don't store per-cell formulas at this layer
// (the resolver returns the *value*, not the source), so we serialize the
// reference itself. The output is still useful as a textual representation
// of what's being read.
register('FORMULATEXT', () => {
  const ctx = getCallContext();
  const refNode = ctx?.argNodes[0];
  if (!nodeIsRef(refNode)) return VALUE_ERROR;
  return serialize(refNode as FormulaNode);
});

// ----- ISFORMULA / ISREF ----------------------------------------------------
//
// ISFORMULA(reference) — true if the referenced cell contains a formula. We
// can't distinguish formula-cells from value-cells without an additional
// resolver hook, so this stays conservative-false. The signature is still
// strictly checked: a non-reference argument returns #VALUE!.
//
// ISREF(value) — true if the argument was a cell or range reference. Reads
// the AST via the call context so it can answer correctly for expressions
// like `=ISREF(A1)` vs `=ISREF("A1")`.
register('ISFORMULA', () => {
  const ctx = getCallContext();
  const refNode = ctx?.argNodes[0];
  if (!nodeIsRef(refNode)) return VALUE_ERROR;
  return false;
});

register('ISREF', () => {
  const ctx = getCallContext();
  const refNode = ctx?.argNodes[0];
  return nodeIsRef(refNode);
});

// ----- Remaining pure stubs (still deferred) --------------------------------
//
// These require infrastructure that doesn't live in this engine yet: pivot
// tables (GETPIVOTDATA), real-time data feeds (RTD), embedded images
// (IMAGE), area-count introspection that crosses non-contiguous ranges
// (AREAS), and CJK locale-specific text handling (BAHTTEXT, ASC, JIS,
// DBCS, PHONETIC).
// CJK locale functions (BAHTTEXT / ASC / JIS / DBCS / PHONETIC) are now
// implemented in `./cjk.ts` (wave 20). The remaining stubs need host
// infrastructure not present in this engine.
for (const name of ['GETPIVOTDATA', 'RTD', 'IMAGE', 'AREAS']) {
  register(name, () => NAME_ERROR);
}

// LAMBDA itself is special-cased in the evaluator (constructs a
// FormulaFunction from the AST + captured resolver). The consumers below
// take a FormulaFunction value as one of their args and invoke its
// .call() per element / row / column / fold step. Wave 16 (2026-06-02).

// ----- VALUETOTEXT / ARRAYTOTEXT --------------------------------------------

register('VALUETOTEXT', (args) => {
  const v = args[0];
  const fmt = args[1] === 1 ? 1 : 0;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return fmt === 1 ? `"${v}"` : v;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (isFormulaError(v)) return v.code;
  return String(v);
});

register('ARRAYTOTEXT', (args) => {
  const a = to2D(args[0]);
  const fmt = args[1] === 1 ? 1 : 0;
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return fmt === 1 ? `"${v}"` : v;
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (isFormulaError(v)) return v.code;
    return String(v);
  };
  if (fmt === 1) {
    return `{${a.map((r) => r.map(cell).join(',')).join(';')}}`;
  }
  return a.flat().map(cell).join(', ');
});
