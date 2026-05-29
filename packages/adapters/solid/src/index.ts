// =============================================================================
// @onegrid/solid
//
// Solid.js adapter. Idiomatic primitives over the framework-agnostic core.
// Solid's signals align directly with oneGrid's reactive substrate.
//
// Public surface:
//   - createOneGrid(getOptions) → { ref, grid } — Solid primitive
// =============================================================================

export { createOneGrid } from './create-one-grid';
export type { CreateOneGridOptions, CreateOneGridReturn } from './create-one-grid';

export type {
  CellRenderContext,
  CellRenderer,
  ColumnDef,
  ColumnGroupDef,
  ContextMenuTarget,
  FrameStats,
  Grid,
  GridOptions,
  GridTheme,
  MetricsSnapshot,
  RowGroupMeta,
  RowMeta,
  RowSource,
  ValidationContext,
  ValidationResult,
} from '@onegrid/core';

export type {
  BlockRequest,
  BlockResponse,
  DataSource,
  FilterModel,
  FilterNode,
  Schema,
  SortField,
  SortModel,
} from '@onegrid/protocol';
