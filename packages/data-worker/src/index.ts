// =============================================================================
// @onegrid/data-worker (host side)
//
// Typed client wrapping @onegrid/worker-plugins for sort / filter / group /
// pivot operations on a ColumnTable.
//
// Why this exists: even with column-virtualization + adaptive overscan, a
// 1M-row in-memory sort takes ~700 ms on a typical laptop (real-Chromium
// bench). That's 42 frames of jank on the render thread. This package
// moves the work to a Worker so the grid keeps painting at 60 FPS while
// the sort completes, then swaps in the result.
//
// Authors construct their own Worker (with bundler-specific URL plumbing —
// Vite's `new Worker(new URL(...), { type: 'module' })`, webpack's
// `worker-loader`, esbuild's `--define`, etc.) and pass it to
// `createDataWorker(worker)`. We don't ship a pre-bundled worker.js
// because every build tool inlines workers differently.
// =============================================================================

import {
  WorkerPluginHost,
  type WorkerLike,
} from '@onegrid/worker-plugins';
import type {
  SortOptions,
  FilterOptions,
  GroupRowsOptions,
  ColumnTable,
  GroupNode,
} from '@onegrid/data';
import type {
  SortModel,
  FilterModel,
  GroupingModel,
  PivotModel,
} from '@onegrid/protocol';

export interface DataWorkerOptions {
  readonly worker: WorkerLike;
  /** Per-call timeout in ms. Default 60 000 (1M-row sort allowance). */
  readonly timeoutMs?: number;
}

export class DataWorker {
  private readonly host: WorkerPluginHost;

  constructor(opts: DataWorkerOptions) {
    this.host = new WorkerPluginHost({
      worker: opts.worker,
      timeoutMs: opts.timeoutMs ?? 60_000,
    });
  }

  /** List of registered handler names once the worker is ready. */
  get ready(): Promise<ReadonlyArray<string>> {
    return this.host.ready;
  }

  /**
   * Sort a `ColumnTable`. Returns an `Int32Array` of source indices in
   * sorted order. The table travels by structured clone (typed arrays
   * survive zero-copy).
   */
  sort(
    table: ColumnTable,
    sort: SortModel,
    options?: SortOptions,
  ): Promise<Int32Array> {
    return this.host.invoke('sort', [{ table, sort, options }]);
  }

  /** Filter a `ColumnTable`. Returns the surviving-row BitmapSelection. */
  filter(
    table: ColumnTable,
    filter: FilterModel,
    options?: FilterOptions,
  ): Promise<unknown> {
    return this.host.invoke('filter', [{ table, filter, options }]);
  }

  /** Group rows by the configured key columns. */
  group(
    table: ColumnTable,
    grouping: GroupingModel,
    options?: GroupRowsOptions,
  ): Promise<GroupNode> {
    return this.host.invoke('group', [{ table, grouping, options }]);
  }

  /** Pivot — values × dimensions → wide layout. */
  pivot(table: ColumnTable, model: PivotModel): Promise<unknown> {
    return this.host.invoke('pivot', [{ table, model }]);
  }

  dispose(): void {
    this.host.dispose();
  }
}

export function createDataWorker(opts: DataWorkerOptions): DataWorker {
  return new DataWorker(opts);
}
