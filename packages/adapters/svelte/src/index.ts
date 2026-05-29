// =============================================================================
// @onegrid/svelte
//
// Svelte adapter. Store-based factory that works in both Svelte 4 and 5
// (with stores still first-class). Svelte 5 consumers can pair it with
// the runes API in their own component code.
//
// Public surface:
//   - createOneGrid(initial) → { attach, grid, setOptions, destroy }
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
