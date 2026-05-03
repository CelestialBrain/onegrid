// =============================================================================
// ColumnTable
//
// In-memory columnar table with Apache-Arrow-compatible Struct-of-Arrays
// layout. The renderer reads cells one at a time via `column(id).get(row)`,
// so each cell read is a typed-array lookup — no object allocation, no GC
// pressure on the scroll hot path.
//
// This is the minimal implementation oneGrid needs. It does NOT yet ingest
// real Apache Arrow IPC bytes — that's on the roadmap once the data
// adapter surface settles. For now, ColumnTable is built from typed-array
// column data plus a Schema.
// =============================================================================

import type { ColumnSchema, Schema } from '@onegrid/protocol';

export interface ColumnVector {
  readonly schema: ColumnSchema;
  readonly length: number;
  /** Read the cell at the given row index. Returns undefined for out-of-range. */
  readonly get: (rowIndex: number) => unknown;
  /** True if the cell is null at the given row. */
  readonly isNull: (rowIndex: number) => boolean;
}

export type ColumnData =
  | ReadonlyArray<unknown>
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array;

export interface ColumnInput {
  readonly schema: ColumnSchema;
  readonly data: ColumnData;
  /** Optional null bitmap (Uint8Array). Bit `i` set = row `i` is non-null. */
  readonly validity?: Uint8Array;
}

export interface ColumnTable {
  readonly schema: Schema;
  readonly numRows: number;
  readonly column: (id: string) => ColumnVector;
  readonly hasColumn: (id: string) => boolean;
  /** Zero-copy slice. Length is clamped to [0, numRows - offset]. */
  readonly slice: (offset: number, length: number) => ColumnTable;
}

export function createColumnTable(columns: ReadonlyArray<ColumnInput>): ColumnTable {
  if (columns.length === 0) {
    return EMPTY_TABLE;
  }
  const numRows = columns[0]!.data.length;
  for (const c of columns) {
    if (c.data.length !== numRows) {
      throw new Error(
        `createColumnTable: column "${c.schema.id}" has length ${c.data.length}, expected ${numRows}.`,
      );
    }
  }
  const schema: Schema = columns.map((c) => c.schema);
  const byId = new Map<string, ColumnVector>();
  for (const c of columns) {
    byId.set(c.schema.id, makeVector(c, 0, numRows));
  }
  return {
    schema,
    numRows,
    column: (id) => {
      const v = byId.get(id);
      if (!v) throw new Error(`ColumnTable: unknown column "${id}".`);
      return v;
    },
    hasColumn: (id) => byId.has(id),
    slice: (offset, length) => sliceTable(columns, offset, length),
  };
}

function sliceTable(
  columns: ReadonlyArray<ColumnInput>,
  offset: number,
  length: number,
): ColumnTable {
  const max = columns[0]?.data.length ?? 0;
  const start = Math.max(0, Math.min(offset, max));
  const end = Math.max(start, Math.min(start + length, max));
  const sliceLen = end - start;
  const schema: Schema = columns.map((c) => c.schema);
  const byId = new Map<string, ColumnVector>();
  for (const c of columns) {
    byId.set(c.schema.id, makeVector(c, start, sliceLen));
  }
  return {
    schema,
    numRows: sliceLen,
    column: (id) => {
      const v = byId.get(id);
      if (!v) throw new Error(`ColumnTable: unknown column "${id}".`);
      return v;
    },
    hasColumn: (id) => byId.has(id),
    slice: (off, len) => sliceTable(columns, start + off, Math.min(len, sliceLen - off)),
  };
}

function makeVector(input: ColumnInput, offset: number, length: number): ColumnVector {
  const data = input.data;
  const validity = input.validity;

  const get = (rowIndex: number): unknown => {
    if (rowIndex < 0 || rowIndex >= length) return undefined;
    const idx = offset + rowIndex;
    return (data as ReadonlyArray<unknown>)[idx];
  };

  const isNull = (rowIndex: number): boolean => {
    if (rowIndex < 0 || rowIndex >= length) return true;
    const idx = offset + rowIndex;
    if (validity) {
      const byte = validity[idx >>> 3] ?? 0;
      return (byte & (1 << (idx & 7))) === 0;
    }
    const v = (data as ReadonlyArray<unknown>)[idx];
    return v === null || v === undefined;
  };

  return {
    schema: input.schema,
    length,
    get,
    isNull,
  };
}

const EMPTY_TABLE: ColumnTable = {
  schema: [],
  numRows: 0,
  column: (id) => {
    throw new Error(`ColumnTable: unknown column "${id}" (empty table).`);
  },
  hasColumn: () => false,
  slice: () => EMPTY_TABLE,
};
