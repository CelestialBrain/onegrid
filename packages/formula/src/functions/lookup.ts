// =============================================================================
// Lookup / reference category (v1.1.0).
//
// Most lookup functions operate on 2D ranges. When the input arrives as a
// flat 1D array (the @onegrid/formula CellResolver default), it's treated
// as a single column. Adopters get full 2D semantics by passing an array-
// of-arrays literal or upgrading their `getRange` resolver to return 2D.
// =============================================================================

import { compare, toBoolean, toNumber } from '../coerce';
import {
  NA_ERROR,
  NUM_ERROR,
  REF_ERROR,
  VALUE_ERROR,
  isFormulaError,
} from '../errors';
import { approxBinarySearch, getCallContext, register, to2D } from './_shared';

register('VLOOKUP', (args) => {
  const target = args[0];
  const table = to2D(args[1]);
  const colIdx = toNumber(args[2]);
  if (isFormulaError(colIdx)) return colIdx;
  const ci = Math.trunc(colIdx) - 1;
  if (ci < 0) return VALUE_ERROR;
  const exact = args.length > 3 ? !toBoolean(args[3]) : false;
  if (table.length === 0) return NA_ERROR;
  if (ci >= table[0]!.length) return REF_ERROR;
  if (exact) {
    for (let r = 0; r < table.length; r++) {
      if (compare(table[r]![0], target) === 0) return table[r]![ci];
    }
    return NA_ERROR;
  }
  const firstCol = table.map((row) => row[0]);
  const i = approxBinarySearch(firstCol, target);
  return i < 0 ? NA_ERROR : table[i]![ci];
});

register('HLOOKUP', (args) => {
  const target = args[0];
  const table = to2D(args[1]);
  const rowIdx = toNumber(args[2]);
  if (isFormulaError(rowIdx)) return rowIdx;
  const ri = Math.trunc(rowIdx) - 1;
  if (ri < 0 || ri >= table.length) return REF_ERROR;
  const exact = args.length > 3 ? !toBoolean(args[3]) : false;
  if (table.length === 0 || table[0]!.length === 0) return NA_ERROR;
  if (exact) {
    const top = table[0]!;
    for (let c = 0; c < top.length; c++) {
      if (compare(top[c], target) === 0) return table[ri]![c];
    }
    return NA_ERROR;
  }
  const i = approxBinarySearch(table[0]!, target);
  return i < 0 ? NA_ERROR : table[ri]![i];
});

register('LOOKUP', (args) => {
  const target = args[0];
  const lookupVec = (() => {
    const v = args[1];
    if (Array.isArray(v) && v.length > 0 && Array.isArray(v[0])) {
      return (v as unknown[][]).map((row) => row[0]);
    }
    return Array.isArray(v) ? (v as unknown[]) : [v];
  })();
  const resultVec = (() => {
    if (args.length < 3) return lookupVec;
    const v = args[2];
    if (Array.isArray(v) && v.length > 0 && Array.isArray(v[0])) {
      return (v as unknown[][]).map((row) => row[0]);
    }
    return Array.isArray(v) ? (v as unknown[]) : [v];
  })();
  const i = approxBinarySearch(lookupVec, target);
  return i < 0 ? NA_ERROR : resultVec[Math.min(i, resultVec.length - 1)];
});

register('MATCH', (args) => {
  const target = args[0];
  const lookupArr = (() => {
    const v = args[1];
    if (Array.isArray(v) && v.length > 0 && Array.isArray(v[0])) {
      return (v as unknown[][]).flat();
    }
    return Array.isArray(v) ? (v as unknown[]) : [v];
  })();
  const matchType = args.length > 2 ? toNumber(args[2]) : 1;
  if (isFormulaError(matchType)) return matchType;
  if (matchType === 0) {
    for (let i = 0; i < lookupArr.length; i++) {
      if (compare(lookupArr[i], target) === 0) return i + 1;
    }
    return NA_ERROR;
  }
  if (matchType === 1) {
    const i = approxBinarySearch(lookupArr, target);
    return i < 0 ? NA_ERROR : i + 1;
  }
  if (matchType === -1) {
    let best = -1;
    for (let i = 0; i < lookupArr.length; i++) {
      if (compare(lookupArr[i], target) >= 0) best = i;
      else break;
    }
    return best < 0 ? NA_ERROR : best + 1;
  }
  return NA_ERROR;
});

register('INDEX', (args) => {
  const arr = to2D(args[0]);
  const rowNum = toNumber(args[1] ?? 0);
  if (isFormulaError(rowNum)) return rowNum;
  const colNum = args.length > 2 ? toNumber(args[2]) : 0;
  if (isFormulaError(colNum)) return colNum;
  const r = Math.trunc(rowNum);
  const c = Math.trunc(colNum as number);
  if (r === 0 && c === 0) return arr;
  if (r === 0) {
    if (c < 1 || c > arr[0]!.length) return REF_ERROR;
    return arr.map((row) => row[c - 1]);
  }
  if (c === 0) {
    if (r < 1 || r > arr.length) return REF_ERROR;
    return arr[r - 1]!;
  }
  if (r < 1 || r > arr.length) return REF_ERROR;
  if (c < 1 || c > arr[r - 1]!.length) return REF_ERROR;
  return arr[r - 1]![c - 1];
});

register('CHOOSE', (args) => {
  const idx = toNumber(args[0]);
  if (isFormulaError(idx)) return idx;
  const i = Math.trunc(idx);
  if (i < 1 || i >= args.length) return VALUE_ERROR;
  return args[i];
});

// ----- OFFSET / INDIRECT (wave 15) ------------------------------------------
//
// Both need access to the active resolver and to the AST of the reference
// argument; they read it from the per-call CallContext set by the evaluator.
// OFFSET(reference, rows, cols, [height], [width]) — returns the value (or
// 2D array slice) at the derived address. INDIRECT(refText, [a1]) — parses
// the string as a reference and resolves through the active resolver.

function parseA1ForOffset(ref: string): { col: number; row: number; absCol: boolean; absRow: boolean } | undefined {
  const m = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(ref.toUpperCase());
  if (!m) return undefined;
  const absCol = m[1] === '$';
  const letters = m[2]!;
  const absRow = m[3] === '$';
  let col = 0;
  for (let i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
  return { col, row: Number(m[4]), absCol, absRow };
}

function colLetters(col: number): string {
  let s = '';
  let n = col;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

register('OFFSET', (args) => {
  const ctx = getCallContext();
  const refNode = ctx?.argNodes[0];
  if (!refNode || typeof refNode !== 'object') return VALUE_ERROR;
  const kind = (refNode as { kind?: unknown }).kind;
  if (kind !== 'cellRef' && kind !== 'rangeRef') return VALUE_ERROR;
  const refText = (refNode as { ref: string }).ref;
  const baseRef = (kind === 'rangeRef' ? refText.split(':')[0]! : refText);
  const parsed = parseA1ForOffset(baseRef);
  if (!parsed) return REF_ERROR;
  const rows = toNumber(args[1]);
  if (isFormulaError(rows)) return rows;
  const cols = toNumber(args[2]);
  if (isFormulaError(cols)) return cols;
  const height = args[3] !== undefined ? toNumber(args[3]) : 1;
  if (isFormulaError(height)) return height;
  const width = args[4] !== undefined ? toNumber(args[4]) : 1;
  if (isFormulaError(width)) return width;
  if (height < 1 || width < 1) return REF_ERROR;
  const newRow = parsed.row + Math.trunc(rows);
  const newCol = parsed.col + Math.trunc(cols);
  if (newRow < 1 || newCol < 1) return REF_ERROR;
  const h = Math.trunc(height);
  const w = Math.trunc(width);
  const resolver = ctx?.resolver as { getCell: (ref: string) => unknown } | undefined;
  if (!resolver) return REF_ERROR;
  if (h === 1 && w === 1) {
    return resolver.getCell(`${colLetters(newCol)}${newRow}`);
  }
  const out: unknown[][] = [];
  for (let r = 0; r < h; r++) {
    const row: unknown[] = [];
    for (let c = 0; c < w; c++) {
      row.push(resolver.getCell(`${colLetters(newCol + c)}${newRow + r}`));
    }
    out.push(row);
  }
  return out;
});

register('INDIRECT', (args) => {
  const ctx = getCallContext();
  const text = args[0];
  if (typeof text !== 'string') return REF_ERROR;
  const trimmed = text.trim();
  const resolver = ctx?.resolver as
    | { getCell: (ref: string) => unknown; getRange: (ref: string) => ReadonlyArray<unknown> }
    | undefined;
  if (!resolver) return REF_ERROR;
  try {
    if (/^[$]?[A-Z]+[$]?\d+:[$]?[A-Z]+[$]?\d+$/i.test(trimmed)) {
      return resolver.getRange(trimmed);
    }
    if (/^[$]?[A-Z]+[$]?\d+$/i.test(trimmed)) {
      return resolver.getCell(trimmed);
    }
    return REF_ERROR;
  } catch {
    return REF_ERROR;
  }
});

register('ROW', (args) => {
  if (args.length === 0 || args[0] === undefined) return 1;
  if (Array.isArray(args[0])) return 1;
  return 1;
});

register('COLUMN', (args) => {
  if (args.length === 0 || args[0] === undefined) return 1;
  if (Array.isArray(args[0])) return 1;
  return 1;
});

register('ROWS', (args) => {
  const v = args[0];
  if (!Array.isArray(v)) return 1;
  if (v.length > 0 && Array.isArray(v[0])) return v.length;
  return v.length;
});

register('COLUMNS', (args) => {
  const v = args[0];
  if (!Array.isArray(v)) return 1;
  if (v.length > 0 && Array.isArray(v[0])) return (v[0] as unknown[]).length;
  return 1;
});

register('ADDRESS', (args) => {
  const row = toNumber(args[0]);
  const col = toNumber(args[1]);
  if (isFormulaError(row)) return row;
  if (isFormulaError(col)) return col;
  if (row < 1 || col < 1) return VALUE_ERROR;
  const absNum = args.length > 2 ? toNumber(args[2]) : 1;
  if (isFormulaError(absNum)) return absNum;
  const colDollar = absNum === 1 || absNum === 3 ? '$' : '';
  const rowDollar = absNum === 1 || absNum === 2 ? '$' : '';
  let n = Math.trunc(col);
  let colName = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    colName = String.fromCharCode(65 + rem) + colName;
    n = Math.floor((n - 1) / 26);
  }
  const a1Style = args.length <= 3 || toBoolean(args[3]) !== false;
  if (!a1Style) {
    return `R${rowDollar ? Math.trunc(row) : '[' + Math.trunc(row) + ']'}C${colDollar ? Math.trunc(col) : '[' + Math.trunc(col) + ']'}`;
  }
  return `${colDollar}${colName}${rowDollar}${Math.trunc(row)}`;
});

// ----- Modern dynamic-array functions (Excel 2019+) -----

register('XLOOKUP', (args) => {
  const target = args[0];
  const lookupArr = (() => {
    const v = args[1];
    if (Array.isArray(v) && v.length > 0 && Array.isArray(v[0])) {
      return (v as unknown[][]).map((r) => r[0]);
    }
    return Array.isArray(v) ? (v as unknown[]) : [v];
  })();
  const returnArr = (() => {
    const v = args[2];
    if (Array.isArray(v) && v.length > 0 && Array.isArray(v[0])) {
      return (v as unknown[][]).map((r) => r[0]);
    }
    return Array.isArray(v) ? (v as unknown[]) : [v];
  })();
  const notFound = args.length > 3 ? args[3] : NA_ERROR;
  const matchMode = args.length > 4 ? toNumber(args[4]) : 0;
  if (isFormulaError(matchMode)) return matchMode;
  const searchMode = args.length > 5 ? toNumber(args[5]) : 1;
  if (isFormulaError(searchMode)) return searchMode;

  const idxs: number[] = [];
  if (searchMode === 1) {
    for (let i = 0; i < lookupArr.length; i++) idxs.push(i);
  } else if (searchMode === -1) {
    for (let i = lookupArr.length - 1; i >= 0; i--) idxs.push(i);
  } else if (searchMode === 2 || searchMode === -2) {
    const ascending = searchMode === 2;
    if (matchMode === 0 || matchMode === 1 || matchMode === -1) {
      const sorted = ascending ? lookupArr : [...lookupArr].reverse();
      let lo = 0, hi = sorted.length - 1, found = -1, best = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const cmp = compare(sorted[mid], target);
        if (cmp === 0) {
          found = mid;
          break;
        }
        if (cmp < 0) {
          if (matchMode === -1) best = mid;
          lo = mid + 1;
        } else {
          if (matchMode === 1) best = mid;
          hi = mid - 1;
        }
      }
      const pick = found >= 0 ? found : best;
      if (pick < 0) return notFound;
      const realIdx = ascending ? pick : lookupArr.length - 1 - pick;
      return returnArr[realIdx];
    }
  }

  for (const i of idxs) {
    const cmp = compare(lookupArr[i], target);
    if (cmp === 0) return returnArr[i];
  }
  if (matchMode === -1) {
    let best = -1;
    for (const i of idxs) {
      if (compare(lookupArr[i], target) <= 0) {
        if (best < 0 || compare(lookupArr[i], lookupArr[best]) > 0) best = i;
      }
    }
    return best < 0 ? notFound : returnArr[best];
  }
  if (matchMode === 1) {
    let best = -1;
    for (const i of idxs) {
      if (compare(lookupArr[i], target) >= 0) {
        if (best < 0 || compare(lookupArr[i], lookupArr[best]) < 0) best = i;
      }
    }
    return best < 0 ? notFound : returnArr[best];
  }
  if (matchMode === 2) {
    const tStr = String(target);
    const re = new RegExp(
      '^' + tStr.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
      'i',
    );
    for (const i of idxs) {
      if (re.test(String(lookupArr[i]))) return returnArr[i];
    }
  }
  return notFound;
});

register('XMATCH', (args) => {
  const target = args[0];
  const arr = (() => {
    const v = args[1];
    if (Array.isArray(v) && v.length > 0 && Array.isArray(v[0])) {
      return (v as unknown[][]).flat();
    }
    return Array.isArray(v) ? (v as unknown[]) : [v];
  })();
  const matchMode = args.length > 2 ? toNumber(args[2]) : 0;
  if (isFormulaError(matchMode)) return matchMode;
  const searchMode = args.length > 3 ? toNumber(args[3]) : 1;
  if (isFormulaError(searchMode)) return searchMode;

  const idxs: number[] = [];
  if (searchMode === -1) {
    for (let i = arr.length - 1; i >= 0; i--) idxs.push(i);
  } else {
    for (let i = 0; i < arr.length; i++) idxs.push(i);
  }
  if (matchMode === 0) {
    for (const i of idxs) {
      if (compare(arr[i], target) === 0) return i + 1;
    }
    return NA_ERROR;
  }
  if (matchMode === 2) {
    const tStr = String(target);
    const re = new RegExp(
      '^' + tStr.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
      'i',
    );
    for (const i of idxs) {
      if (re.test(String(arr[i]))) return i + 1;
    }
    return NA_ERROR;
  }
  if (matchMode === -1 || matchMode === 1) {
    let best = -1;
    for (const i of idxs) {
      const cmp = compare(arr[i], target);
      if (cmp === 0) return i + 1;
      if (matchMode === -1 && cmp < 0) {
        if (best < 0 || compare(arr[i], arr[best]) > 0) best = i;
      }
      if (matchMode === 1 && cmp > 0) {
        if (best < 0 || compare(arr[i], arr[best]) < 0) best = i;
      }
    }
    return best < 0 ? NA_ERROR : best + 1;
  }
  return NA_ERROR;
});

register('FILTER', (args) => {
  const arr = args[0];
  const include = args[1];
  const ifEmpty = args.length > 2 ? args[2] : NA_ERROR;
  if (!Array.isArray(arr) || !Array.isArray(include)) return VALUE_ERROR;
  const arr2 = to2D(arr);
  const inc = (() => {
    if ((include as unknown[]).length > 0 && Array.isArray((include as unknown[])[0])) {
      return (include as unknown[][]).map((r) => r[0]);
    }
    return include as unknown[];
  })();
  if (arr2.length !== inc.length) return VALUE_ERROR;
  const out: unknown[][] = [];
  for (let i = 0; i < arr2.length; i++) {
    const b = toBoolean(inc[i]);
    if (isFormulaError(b)) return b;
    if (b) out.push(arr2[i]!);
  }
  if (out.length === 0) return ifEmpty;
  return out;
});

register('SORT', (args) => {
  const arr = args[0];
  if (!Array.isArray(arr)) return VALUE_ERROR;
  const arr2 = to2D(arr).map((row) => [...row]);
  const sortIdx = args.length > 1 ? toNumber(args[1]) : 1;
  if (isFormulaError(sortIdx)) return sortIdx;
  const order = args.length > 2 ? toNumber(args[2]) : 1;
  if (isFormulaError(order)) return order;
  const byRow = args.length > 3 ? toBoolean(args[3]) : false;
  if (isFormulaError(byRow)) return byRow;
  const ci = Math.trunc(sortIdx) - 1;
  const dir = order < 0 ? -1 : 1;
  if (byRow) {
    const ncols = arr2[0]?.length ?? 0;
    const cols = Array.from({ length: ncols }, (_, j) => arr2.map((r) => r[j]));
    cols.sort((a, b) => dir * compare(a[ci], b[ci]));
    return arr2.map((_, r) => cols.map((c) => c[r]));
  }
  arr2.sort((a, b) => dir * compare(a[ci], b[ci]));
  return arr2;
});

register('SORTBY', (args) => {
  const arr = args[0];
  if (!Array.isArray(arr)) return VALUE_ERROR;
  const arr2 = to2D(arr);
  type SortKey = { values: unknown[]; dir: number };
  const keys: SortKey[] = [];
  let i = 1;
  while (i < args.length) {
    const by = args[i];
    if (!Array.isArray(by)) return VALUE_ERROR;
    const vals = (() => {
      if ((by as unknown[]).length > 0 && Array.isArray((by as unknown[])[0])) {
        return (by as unknown[][]).map((r) => r[0]);
      }
      return by as unknown[];
    })();
    if (vals.length !== arr2.length) return VALUE_ERROR;
    const order = i + 1 < args.length && !Array.isArray(args[i + 1])
      ? toNumber(args[i + 1])
      : 1;
    if (isFormulaError(order)) return order;
    keys.push({ values: vals, dir: order < 0 ? -1 : 1 });
    i += i + 1 < args.length && !Array.isArray(args[i + 1]) ? 2 : 1;
  }
  const indices = arr2.map((_, idx) => idx);
  indices.sort((a, b) => {
    for (const k of keys) {
      const cmp = compare(k.values[a], k.values[b]);
      if (cmp !== 0) return k.dir * cmp;
    }
    return 0;
  });
  return indices.map((idx) => arr2[idx]!);
});

register('UNIQUE', (args) => {
  const arr = args[0];
  if (!Array.isArray(arr)) return [[args[0]]];
  const arr2 = to2D(arr);
  const seen = new Set<string>();
  const out: unknown[][] = [];
  for (const row of arr2) {
    const key = row.map((v) => (v === null || v === undefined ? '' : String(v))).join('');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(row);
    }
  }
  return out;
});

register('SEQUENCE', (args) => {
  const rows = toNumber(args[0]);
  if (isFormulaError(rows)) return rows;
  const cols = args.length > 1 ? toNumber(args[1]) : 1;
  if (isFormulaError(cols)) return cols;
  const start = args.length > 2 ? toNumber(args[2]) : 1;
  if (isFormulaError(start)) return start;
  const step = args.length > 3 ? toNumber(args[3]) : 1;
  if (isFormulaError(step)) return step;
  const R = Math.trunc(rows);
  const C = Math.trunc(cols);
  if (R < 1 || C < 1) return NUM_ERROR;
  const out: number[][] = [];
  let v = start;
  for (let r = 0; r < R; r++) {
    const row: number[] = [];
    for (let c = 0; c < C; c++) {
      row.push(v);
      v += step;
    }
    out.push(row);
  }
  return out;
});
