// =============================================================================
// @onegrid/data
//
// Columnar data layer. Apache Arrow-compatible Struct-of-Arrays storage,
// Roaring bitmap selection vectors, sort-permutation cache, group tree
// (adjacency list + flat-visible cache), Fenwick-tree row heights, IVM hooks.
//
// Public API surface (planned). Implementations TODO.
// =============================================================================

import type { ColumnSchema, Schema } from '@onegrid/protocol';

export interface ColumnVector {
  readonly schema: ColumnSchema;
  readonly length: number;
  readonly get: (rowIndex: number) => unknown;
  readonly isNull: (rowIndex: number) => boolean;
}

export interface ColumnTable {
  readonly schema: Schema;
  readonly numRows: number;
  readonly column: (id: string) => ColumnVector;
  readonly slice: (offset: number, length: number) => ColumnTable;
}

export interface BitmapSelection {
  readonly cardinality: number;
  readonly contains: (rowIndex: number) => boolean;
  readonly add: (rowIndex: number) => void;
  readonly remove: (rowIndex: number) => void;
  readonly intersect: (other: BitmapSelection) => BitmapSelection;
  readonly union: (other: BitmapSelection) => BitmapSelection;
}

export interface SortIndex {
  readonly columnId: string;
  readonly direction: 'asc' | 'desc';
  readonly permutation: Int32Array;
}

export const createColumnTable = (_schema: Schema): ColumnTable => {
  throw new Error('@onegrid/data: createColumnTable is not implemented yet.');
};

export const createBitmapSelection = (): BitmapSelection => {
  throw new Error('@onegrid/data: createBitmapSelection is not implemented yet.');
};
