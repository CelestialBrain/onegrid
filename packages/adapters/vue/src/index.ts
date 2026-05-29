// =============================================================================
// @onegrid/vue
//
// Vue 3 adapter. Idiomatic composables over the framework-agnostic core.
//
// Public surface:
//   - useOneGrid(options) → { containerRef, grid } — Vue composable
// =============================================================================

export { useOneGrid } from './use-one-grid';
export type { UseOneGridOptions, UseOneGridReturn } from './use-one-grid';

// Re-export the most common @onegrid/core types so consumers don't
// need a separate import — mirrors the @onegrid/react surface.
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
