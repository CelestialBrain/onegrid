// =============================================================================
// @onegrid/react
//
// React adapter. Idiomatic hooks over the framework-agnostic core. Owns no
// state — delegates everything to @onegrid/core's Grid instance.
//
// Public surface:
//   - useOneGrid(options) → { ref, grid }
//   - <OneGrid {...options} /> — convenience component for the common case
// =============================================================================

export { useOneGrid } from './use-one-grid';
export type { UseOneGridOptions, UseOneGridReturn } from './use-one-grid';

export { OneGrid } from './one-grid';
export type { OneGridProps } from './one-grid';

// Re-export core types so adapter consumers don't need to import @onegrid/core directly.
export type {
  ColumnDef,
  ColumnGroupDef,
  FrameStats,
  Grid,
  GridOptions,
  GridTheme,
  MetricsSnapshot,
  RowGroupMeta,
  RowMeta,
  RowSource,
} from '@onegrid/core';

// Pass-through of common protocol types so adapters can speak the SSRM
// contract without a separate @onegrid/protocol install.
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
