// =============================================================================
// @onegrid/data
//
// Columnar data primitives for oneGrid. Apache-Arrow-compatible
// Struct-of-Arrays layout, Fenwick-tree row heights, and (future)
// Roaring-bitmap selection vectors.
//
// All types are framework-agnostic — these are the pieces every renderer,
// formula engine, and SSRM datasource depends on. No DOM, no React.
// =============================================================================

export { FenwickHeights } from './fenwick';

export {
  createColumnTable,
} from './column-table';
export type {
  ColumnData,
  ColumnInput,
  ColumnTable,
  ColumnVector,
} from './column-table';
