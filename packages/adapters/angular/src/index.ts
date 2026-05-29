// =============================================================================
// @onegrid/angular
//
// Angular adapter. Standalone directive over the framework-agnostic core.
// Targets Angular 17+ (standalone components + signals).
//
// Public surface:
//   - OneGridDirective — `<div oneGrid [oneGrid]="opts()"></div>`
//   - OneGridOptions — the bound options type
// =============================================================================

export { OneGridDirective } from './one-grid.directive';
export type { OneGridOptions } from './one-grid.directive';

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
