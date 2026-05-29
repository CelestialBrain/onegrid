// =============================================================================
// @onegrid/angular — standalone directive wrapping the framework-agnostic core.
//
// Usage:
//
//   <div oneGrid [options]="options()"></div>
//
// where `options` is an Angular signal (or any plain reference; the
// directive subscribes via Angular's change-detection lifecycle).
// The directive mounts a Grid into the host element and propagates
// option changes through the same shape-key gate the React / Vue /
// Solid / Svelte adapters use: recreate ONLY on column-shape /
// theme / header / frozen-count change; everything else flows through
// Grid's imperative API.
// =============================================================================

import {
  Directive,
  ElementRef,
  Input,
  signal,
  type OnChanges,
  type OnDestroy,
  type SimpleChanges,
  type WritableSignal,
} from '@angular/core';
import { Grid } from '@onegrid/core';
import type { ColumnDef, GridOptions } from '@onegrid/core';

/** @public */
export type OneGridOptions = Omit<GridOptions, 'host'>;

/** @public */
@Directive({
  selector: '[oneGrid]',
  standalone: true,
})
export class OneGridDirective implements OnChanges, OnDestroy {
  @Input({ required: true }) oneGrid!: OneGridOptions;

  /** Live Grid instance once mounted; signal so consumers can react. */
  readonly grid: WritableSignal<Grid | null> = signal(null);

  private prevShape: string | null = null;
  private prevHeaderHeight: number | undefined;
  private prevFrozen: number | undefined;
  private prevTheme: unknown;
  private prevRowSource: unknown;
  private prevRowHeight: unknown;
  private prevPinnedTop: unknown;
  private prevPinnedBottom: unknown;
  private mounted = false;

  constructor(private readonly elementRef: ElementRef<HTMLDivElement>) {}

  ngOnChanges(_changes: SimpleChanges): void {
    if (!this.mounted) {
      this.mounted = true;
      this.maybeMount();
      return;
    }
    this.applyOptionsDiff();
  }

  ngOnDestroy(): void {
    const g = this.grid();
    if (g) {
      g.destroy();
      this.grid.set(null);
    }
  }

  private maybeMount(): void {
    const o = this.oneGrid;
    const host = this.elementRef.nativeElement;
    if (!host) return;
    if (o.columns.length === 0 || o.rowSource.numRows === 0) return;
    this.prevShape = deriveColumnsShapeKey(o.columns);
    this.prevHeaderHeight = o.headerHeight;
    this.prevFrozen = o.frozenColumnCount;
    this.prevTheme = o.theme;
    this.prevRowSource = o.rowSource;
    this.prevRowHeight = o.rowHeight;
    this.prevPinnedTop = o.pinnedTopRowSource;
    this.prevPinnedBottom = o.pinnedBottomRowSource;
    const instance = new Grid({
      ...o,
      host,
      // Late-bind every callback through `this.oneGrid` so the freshest
      // callback fires without forcing a Grid recreation.
      onFrame: (stats) => this.oneGrid.onFrame?.(stats),
      onSelectionChange: (s) => this.oneGrid.onSelectionChange?.(s),
      onHeaderClick: (id) => this.oneGrid.onHeaderClick?.(id),
      onCellEdit: (row, col, n, oldV) =>
        this.oneGrid.onCellEdit?.(row, col, n, oldV),
      onBeginEdit: (row, col) => this.oneGrid.onBeginEdit?.(row, col),
      onPaste: (row, col, rows) => this.oneGrid.onPaste?.(row, col, rows),
      onToggleExpand: (i) => this.oneGrid.onToggleExpand?.(i),
      getDetailContent: (i) => this.oneGrid.getDetailContent?.(i) ?? null,
      onDetailUnmount: (i, el) => this.oneGrid.onDetailUnmount?.(i, el),
      onFloatingFilterChange: (col, val) =>
        this.oneGrid.onFloatingFilterChange?.(col, val),
      getRowMeta: (row) => this.oneGrid.getRowMeta?.(row) ?? null,
      onToggleGroup: (path) => this.oneGrid.onToggleGroup?.(path),
      onColumnReorder: (from, to, id) =>
        this.oneGrid.onColumnReorder?.(from, to, id),
      onContextMenu: (target) => this.oneGrid.onContextMenu?.(target),
      onFillHandle: (source, fill) =>
        this.oneGrid.onFillHandle?.(source, fill),
    });
    this.grid.set(instance);
  }

  private applyOptionsDiff(): void {
    const next = this.oneGrid;
    const shape = deriveColumnsShapeKey(next.columns);
    const shapeChanged = shape !== this.prevShape;
    const headerChanged = next.headerHeight !== this.prevHeaderHeight;
    const frozenChanged = next.frozenColumnCount !== this.prevFrozen;
    const themeChanged = next.theme !== this.prevTheme;

    if (shapeChanged || headerChanged || frozenChanged || themeChanged) {
      const prev = this.grid();
      if (prev) {
        prev.destroy();
        this.grid.set(null);
      }
      this.maybeMount();
      return;
    }

    const current = this.grid();
    if (!current) return;

    if (next.rowSource !== this.prevRowSource || next.rowHeight !== this.prevRowHeight) {
      this.prevRowSource = next.rowSource;
      this.prevRowHeight = next.rowHeight;
      current.setRowSource(next.rowSource, next.rowHeight);
    }
    if (next.pinnedTopRowSource !== this.prevPinnedTop) {
      this.prevPinnedTop = next.pinnedTopRowSource;
      current.setPinnedTopRowSource(next.pinnedTopRowSource);
    }
    if (next.pinnedBottomRowSource !== this.prevPinnedBottom) {
      this.prevPinnedBottom = next.pinnedBottomRowSource;
      current.setPinnedBottomRowSource(next.pinnedBottomRowSource);
    }
    // Within-shape columns identity changes do NOT echo to
    // setColumns — same drag-resize race rationale documented on the
    // React adapter.
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
