// =============================================================================
// @onegrid/wc
//
// Optional Web Component adapter. Wraps the core in a <one-grid> custom
// element for users who want a framework-free drop-in. NOT the canonical
// public API — power users should reach for a framework adapter or core
// directly.
//
// Public surface:
//   - ONE_GRID_TAG_NAME — default tag ('one-grid')
//   - defineOneGridElement(tag?) — register the custom element
//   - OneGridElement class — direct class access (advanced)
// =============================================================================

import { OneGridElement } from './one-grid-element';

/** @public */
export const ONE_GRID_TAG_NAME = 'one-grid' as const;

/**
 * Register the OneGridElement custom element under the given tag.
 * Default tag is `one-grid`. Calling twice with the same tag is a
 * no-op (the registry already has it).
 *
 * @public
 */
export function defineOneGridElement(tag: string = ONE_GRID_TAG_NAME): void {
  if (typeof customElements === 'undefined') {
    throw new Error(
      '@onegrid/wc: customElements is not available in this environment.',
    );
  }
  if (!customElements.get(tag)) {
    customElements.define(tag, OneGridElement);
  }
}

export { OneGridElement } from './one-grid-element';
export type { OneGridElementOptions } from './one-grid-element';

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
