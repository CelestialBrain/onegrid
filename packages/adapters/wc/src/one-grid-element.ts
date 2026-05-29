// =============================================================================
// @onegrid/wc — <one-grid> custom element.
//
// Drops a Grid into a custom element so framework-free apps can use
// oneGrid via `<one-grid>` + an `options` property. The element
// mirrors the React / Vue / Solid / Svelte / Angular adapters' shape-
// key gate: a Grid is recreated only on column-shape / theme / header
// / frozen-count change; every other update flows through Grid's
// imperative API.
//
// This adapter is the opt-in path for non-framework apps. Power
// users should reach for @onegrid/core directly.
// =============================================================================

import { Grid } from '@onegrid/core';
import type { ColumnDef, GridOptions } from '@onegrid/core';

/** @public */
export type OneGridElementOptions = Omit<GridOptions, 'host'>;

/** @public */
export class OneGridElement extends HTMLElement {
  private host: HTMLDivElement | null = null;
  private _grid: Grid | null = null;
  private _options: OneGridElementOptions | null = null;
  private prevShape: string | null = null;
  private prevHeaderHeight: number | undefined;
  private prevFrozen: number | undefined;
  private prevTheme: unknown;
  private prevRowSource: unknown;
  private prevRowHeight: unknown;
  private prevPinnedTop: unknown;
  private prevPinnedBottom: unknown;

  /**
   * Set the grid options. Re-evaluates the shape diff: recreates the
   * Grid when the shape / header / frozen / theme changes; otherwise
   * fans out through `setRowSource` / `setPinnedTopRowSource` /
   * `setPinnedBottomRowSource`.
   *
   * Reading returns the last-applied options.
   */
  get options(): OneGridElementOptions | null {
    return this._options;
  }

  set options(value: OneGridElementOptions | null) {
    this._options = value;
    if (value !== null) this.applyOptions(value);
  }

  /** Live Grid instance once mounted; `null` until then. */
  get grid(): Grid | null {
    return this._grid;
  }

  connectedCallback(): void {
    // Build the host div inside the custom element if one doesn't
    // exist yet. We intentionally don't use shadow DOM — the grid's
    // styles + canvas context are easier to debug + co-style with
    // the rest of the page when the host is light-DOM.
    if (!this.host) {
      this.host = document.createElement('div');
      this.host.style.cssText = 'position:relative;width:100%;height:100%;';
      this.appendChild(this.host);
    }
    if (this._options) this.applyOptions(this._options);
  }

  disconnectedCallback(): void {
    this.tearDown();
  }

  private tearDown(): void {
    if (this._grid) {
      this._grid.destroy();
      this._grid = null;
    }
    this.prevShape = null;
  }

  private applyOptions(o: OneGridElementOptions): void {
    if (!this.host) return; // element not yet connected
    const shape = deriveColumnsShapeKey(o.columns);

    if (this._grid === null) {
      if (o.columns.length === 0 || o.rowSource.numRows === 0) return;
      this.mount(o, shape);
      return;
    }

    const shapeChanged = shape !== this.prevShape;
    const headerChanged = o.headerHeight !== this.prevHeaderHeight;
    const frozenChanged = o.frozenColumnCount !== this.prevFrozen;
    const themeChanged = o.theme !== this.prevTheme;

    if (shapeChanged || headerChanged || frozenChanged || themeChanged) {
      this.tearDown();
      if (o.columns.length === 0 || o.rowSource.numRows === 0) return;
      this.mount(o, shape);
      return;
    }

    if (o.rowSource !== this.prevRowSource || o.rowHeight !== this.prevRowHeight) {
      this.prevRowSource = o.rowSource;
      this.prevRowHeight = o.rowHeight;
      this._grid.setRowSource(o.rowSource, o.rowHeight);
    }
    if (o.pinnedTopRowSource !== this.prevPinnedTop) {
      this.prevPinnedTop = o.pinnedTopRowSource;
      this._grid.setPinnedTopRowSource(o.pinnedTopRowSource);
    }
    if (o.pinnedBottomRowSource !== this.prevPinnedBottom) {
      this.prevPinnedBottom = o.pinnedBottomRowSource;
      this._grid.setPinnedBottomRowSource(o.pinnedBottomRowSource);
    }
  }

  private mount(o: OneGridElementOptions, shape: string): void {
    if (!this.host) return;
    this.prevShape = shape;
    this.prevHeaderHeight = o.headerHeight;
    this.prevFrozen = o.frozenColumnCount;
    this.prevTheme = o.theme;
    this.prevRowSource = o.rowSource;
    this.prevRowHeight = o.rowHeight;
    this.prevPinnedTop = o.pinnedTopRowSource;
    this.prevPinnedBottom = o.pinnedBottomRowSource;
    this._grid = new Grid({
      ...o,
      host: this.host,
      // Late-bind through `this._options` so callback identity changes
      // (re-set via `el.options = {...}`) propagate without recreating.
      onFrame: (stats) => this._options?.onFrame?.(stats),
      onSelectionChange: (s) => this._options?.onSelectionChange?.(s),
      onHeaderClick: (id) => this._options?.onHeaderClick?.(id),
      onCellEdit: (row, col, n, oldV) =>
        this._options?.onCellEdit?.(row, col, n, oldV),
      onBeginEdit: (row, col) => this._options?.onBeginEdit?.(row, col),
      onPaste: (row, col, rows) => this._options?.onPaste?.(row, col, rows),
      onToggleExpand: (i) => this._options?.onToggleExpand?.(i),
      getDetailContent: (i) => this._options?.getDetailContent?.(i) ?? null,
      onDetailUnmount: (i, el) => this._options?.onDetailUnmount?.(i, el),
      onFloatingFilterChange: (col, val) =>
        this._options?.onFloatingFilterChange?.(col, val),
      getRowMeta: (row) => this._options?.getRowMeta?.(row) ?? null,
      onToggleGroup: (path) => this._options?.onToggleGroup?.(path),
      onColumnReorder: (from, to, id) =>
        this._options?.onColumnReorder?.(from, to, id),
      onContextMenu: (target) => this._options?.onContextMenu?.(target),
      onFillHandle: (source, fill) =>
        this._options?.onFillHandle?.(source, fill),
    });
  }
}

function deriveColumnsShapeKey(columns: ReadonlyArray<ColumnDef>): string {
  let s = '';
  for (let i = 0; i < columns.length; i++) {
    if (i > 0) s += '|';
    s += columns[i]?.id ?? '';
  }
  return s;
}
