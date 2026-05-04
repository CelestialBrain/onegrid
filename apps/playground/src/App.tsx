import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import {
  createReactCellRenderer,
  useOneGrid,
  type CellRenderContext,
  type ColumnDef,
  type FilterModel,
  type FrameStats,
  type MetricsSnapshot,
  type RowSource,
  type SortModel,
} from '@onegrid/react';
import { downloadCsv, downloadXlsx, type ExportColumn } from '@onegrid/export';
import {
  buildMemoryView,
  generateSynthetic,
  materializeSynthetic,
  type MaterializedSyntheticDataset,
} from './lib/synthetic';
import {
  groupRows,
  flattenGroupTree,
  pathKey,
  pivot,
  type FlatGroupEntry,
  type PivotedTable,
} from '@onegrid/data';
import {
  webgpuAvailable,
  getGpuInfo,
  gpuSumFloat32,
  cpuSumFloat32,
} from '@onegrid/webgpu';
import type { RowMeta } from '@onegrid/core';
import { connectSsrm, SSRM_COLUMNS, type SsrmConnection } from './lib/ssrm';
import {
  connectDuckDb,
  DUCKDB_COLUMNS,
  type DuckDbModeHandle,
} from './lib/duckdb-mode';
import {
  FILTER_OPS,
  buildColumnFilter,
  buildQuickFilter,
  isUnaryOp,
  newFilterRule,
  type FilterOp,
  type FilterRule,
} from './lib/filter';
import {
  createFormulaPlayground,
  FORMULA_COLUMNS,
  FORMULA_ROW_COUNT,
  indexToColumnId,
  type FormulaPlaygroundHandle,
} from './lib/formula-mode';

const ROW_OPTIONS = [1_000, 10_000, 100_000, 1_000_000, 10_000_000] as const;

const STATUS_PILL_BG: Record<string, string> = {
  active: '#1f3a2a',
  pending: '#3a2f17',
  archived: '#2a2f37',
  pilot: '#1d2c44',
  churned: '#3a1818',
};
const STATUS_PILL_FG: Record<string, string> = {
  active: '#62d68a',
  pending: '#f4c768',
  archived: '#a5b1c2',
  pilot: '#6ea8fe',
  churned: '#ff8a8a',
};

/**
 * React-based cell renderer for the status column. Renders a colored
 * pill via React state — exercises the framework adapter end-to-end:
 * the React fiber survives scroll-in/scroll-out (the DOM element is
 * pooled, the fiber is not unmounted).
 */
function StatusPillCell({ value }: CellRenderContext): JSX.Element {
  const v = typeof value === 'string' ? value : '';
  return (
    <span
      data-testid="status-pill"
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: STATUS_PILL_BG[v] ?? '#2a2f37',
        color: STATUS_PILL_FG[v] ?? '#a5b1c2',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
      }}
    >
      {v}
    </span>
  );
}

const statusPillRenderer = createReactCellRenderer({
  id: 'status-pill-react',
  component: StatusPillCell,
});

type Mode = 'memory' | 'ssrm' | 'formula' | 'duckdb' | 'pivot';

// Stable references so useOneGrid's effect doesn't re-fire while waiting
// for async data sources to resolve.
const EMPTY_COLUMNS: ReadonlyArray<ColumnDef> = [];
const EMPTY_ROW_SOURCE: RowSource = { numRows: 0, getCell: () => null };

declare global {
  interface Window {
    __onegrid?: {
      getMetrics: () => MetricsSnapshot;
      reset: () => void;
      scrollBy: (deltaY: number) => void;
      scrollToRow: (rowIndex: number) => void;
      setRows: (n: number) => void;
      setSort: (sort: SortModel) => void;
      getSort: () => SortModel;
      setFilter: (query: string) => void;
      getFilter: () => string;
      formulaSet?: (id: string, input: string) => void;
      formulaGet?: (id: string) => unknown;
      formulaStats?: () => unknown;
    };
  }
}

/**
 * Three-state header click toggle: none → asc → desc → none. Honors shift
 * for multi-column sort priority (Excel/Sheets convention).
 */
function toggleSortFor(
  sort: SortModel,
  columnId: string,
  shiftKey: boolean,
): SortModel {
  const existing = sort.find((s) => s.columnId === columnId);
  const others = shiftKey ? sort.filter((s) => s.columnId !== columnId) : [];
  if (!existing) return [...others, { columnId, direction: 'asc' }];
  if (existing.direction === 'asc') {
    return [...others, { columnId, direction: 'desc' }];
  }
  return others; // was desc → remove from sort
}

export const App = (): JSX.Element => {
  const [mode, setMode] = useState<Mode>('memory');
  const [numRows, setNumRows] = useState<(typeof ROW_OPTIONS)[number]>(1_000_000);
  const [genMs, setGenMs] = useState<number>(0);
  const [stats, setStats] = useState<FrameStats | null>(null);
  const [sort, setSort] = useState<SortModel>([]);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [columnFilters, setColumnFilters] = useState<ReadonlyArray<FilterRule>>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  // Capture shiftKey at click-time inside the canvas; the Grid's onHeaderClick
  // doesn't pass the event, so we read it from the latest pointer state.
  const [shiftDown, setShiftDown] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Shift') setShiftDown(e.type === 'keydown');
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  // ----- in-memory dataset -----
  // Materialize typed-array columns (so @onegrid/data sort/filter can run)
  // for sizes up to 1M; for 10M, fall back to the lazy generator since
  // materialization would cost ~500 MB.
  const MATERIALIZE_LIMIT = 1_000_000;
  const memoryDataset = useMemo<
    | (MaterializedSyntheticDataset & { materialized: true })
    | (ReturnType<typeof generateSynthetic> & { materialized: false })
    | null
  >(() => {
    if (mode !== 'memory') return null;
    const t0 = performance.now();
    if (numRows <= MATERIALIZE_LIMIT) {
      const d = materializeSynthetic(numRows);
      const t1 = performance.now();
      setGenMs(Math.round(t1 - t0));
      return { ...d, materialized: true };
    }
    const d = generateSynthetic(numRows);
    const t1 = performance.now();
    setGenMs(Math.round(t1 - t0));
    return { ...d, materialized: false };
  }, [mode, numRows]);

  // Apply sort + column filters to the materialized dataset. For >1M rows
  // (no materialization), fall through with the lazy rowSource and disabled
  // sort/filter UI.
  const memoryView = useMemo(() => {
    if (!memoryDataset || !memoryDataset.materialized) return null;
    const t0 = performance.now();
    const filterModel =
      buildColumnFilter(columnFilters) ??
      (filterQuery ? buildQuickFilter(filterQuery, memoryDataset.columns.map((c) => c.id)) : null);
    const view = buildMemoryView(memoryDataset.table, sort, filterModel);
    const t1 = performance.now();
    if (view.permutation) {
      // eslint-disable-next-line no-console
      console.log(`[onegrid] memory sort+filter: ${(t1 - t0).toFixed(1)}ms · ${String(view.numRows)} rows`);
    }
    return view;
  }, [memoryDataset, sort, columnFilters, filterQuery]);

  // ----- ssrm connection -----
  const [ssrm, setSsrm] = useState<SsrmConnection | null>(null);
  const [ssrmStatus, setSsrmStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>(
    'idle',
  );
  const [ssrmTick, setSsrmTick] = useState(0);

  // ----- formula playground -----
  const [formula, setFormula] = useState<FormulaPlaygroundHandle | null>(null);
  const [formulaTick, setFormulaTick] = useState(0);
  const [formulaActiveCell, setFormulaActiveCell] = useState<string>('A1');
  const [formulaInput, setFormulaInput] = useState<string>('');

  // ----- duckdb-wasm playground -----
  const [duckdb, setDuckdb] = useState<DuckDbModeHandle | null>(null);
  const [duckdbStatus, setDuckdbStatus] = useState<
    'idle' | 'connecting' | 'connected' | 'error'
  >('idle');
  const [duckdbProgress, setDuckdbProgress] = useState<string>('');
  const [duckdbTick, setDuckdbTick] = useState(0);

  useEffect(() => {
    if (mode !== 'formula') {
      setFormula(null);
      return;
    }
    const handle = createFormulaPlayground();
    setFormula(handle);
    setFormulaInput(handle.getDisplaySource('A1'));
  }, [mode]);

  useEffect(() => {
    if (mode !== 'duckdb') {
      // Tear down on mode change so the worker + WASM heap are released.
      setDuckdb((prev) => {
        if (prev) void prev.close();
        return null;
      });
      setDuckdbStatus('idle');
      setDuckdbProgress('');
      return;
    }
    let canceled = false;
    setDuckdbStatus('connecting');
    setDuckdbProgress('starting…');
    connectDuckDb({
      numRows: 100_000,
      onProgress: (m) => {
        if (!canceled) setDuckdbProgress(m);
      },
      onUpdate: () => {
        if (!canceled) setDuckdbTick((t) => t + 1);
      },
    })
      .then((handle) => {
        if (canceled) {
          void handle.close();
          return;
        }
        setDuckdb(handle);
        setDuckdbStatus('connected');
      })
      .catch((err: unknown) => {
        if (canceled) return;
        console.error('[onegrid] duckdb connect failed', err);
        setDuckdbStatus('error');
      });
    return () => {
      canceled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'ssrm') {
      setSsrm(null);
      setSsrmStatus('idle');
      return;
    }
    let canceled = false;
    setSsrmStatus('connecting');
    connectSsrm(() => {
      // Block landed → bump tick so the renderer repaints fresh cells.
      setSsrmTick((t) => t + 1);
    })
      .then((conn) => {
        if (canceled) return;
        setSsrm(conn);
        setSsrmStatus('connected');
      })
      .catch((err: unknown) => {
        if (canceled) return;
        console.error('[onegrid] ssrm connect failed', err);
        setSsrmStatus('error');
      });
    return () => {
      canceled = true;
    };
  }, [mode]);

  // ----- WebGPU benchmark -----
  const [gpuStatus, setGpuStatus] = useState<string>(
    webgpuAvailable() ? 'WebGPU available' : 'WebGPU unavailable',
  );
  const runGpuBench = useCallback(async (): Promise<void> => {
    setGpuStatus('benchmarking…');
    try {
      const info = await getGpuInfo();
      const N = 4_000_000;
      const data = new Float32Array(N);
      for (let i = 0; i < N; i++) data[i] = Math.random();

      const t0 = performance.now();
      const cpuSum = cpuSumFloat32(data);
      const cpuMs = performance.now() - t0;

      const t1 = performance.now();
      const gpuSum = await gpuSumFloat32(data);
      const gpuMs = performance.now() - t1;

      const speedup = (cpuMs / gpuMs).toFixed(1);
      const errPct = (Math.abs(cpuSum - gpuSum) / cpuSum * 100).toFixed(3);
      setGpuStatus(
        `${info?.description ?? 'GPU'}  ·  ${N.toLocaleString()} f32  ·  ` +
          `cpu ${cpuMs.toFixed(0)}ms  ·  gpu ${gpuMs.toFixed(0)}ms  ·  ` +
          `${speedup}× speedup  ·  ${errPct}% Δ`,
      );
    } catch (err) {
      setGpuStatus(`error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  // ----- Pivot mode -----
  // Pivot rebuilds a materialized synthetic dataset (so all groupings have
  // values to aggregate) and pivots region/status × measures into a fresh
  // ColumnTable + ColumnDef set. Cached on numRows so toggling between
  // modes doesn't pay the rebuild cost twice.
  const pivotResult = useMemo<{
    columns: ReadonlyArray<ColumnDef>;
    rowSource: RowSource;
    pivoted: PivotedTable;
  } | null>(() => {
    if (mode !== 'pivot') return null;
    const ds = materializeSynthetic(Math.min(numRows, 100_000));
    const pivoted = pivot(ds.table, {
      rows: ['status'],
      columns: ['firstName'],
      measures: [
        { fn: 'sum', columnId: 'revenue', alias: 'rev' },
        { fn: 'avg', columnId: 'score', alias: 'score' },
      ],
    });
    const columns: ColumnDef[] = [
      { id: 'status', width: 130, displayName: 'Status' },
    ];
    for (const c of pivoted.pivotColumns) {
      const head = String(c.pivotPath[0] ?? '');
      columns.push({
        id: c.id,
        width: 110,
        displayName: `${head} · ${c.measure.alias ?? c.measure.fn}`,
        format: (v) => {
          const n = typeof v === 'number' ? v : Number(v);
          if (!Number.isFinite(n)) return '—';
          return c.measure.fn === 'avg' ? n.toFixed(1) : `$${n.toFixed(0)}`;
        },
      });
    }
    return {
      columns,
      rowSource: {
        numRows: pivoted.table.numRows,
        getCell: (r, id) => pivoted.table.column(id).get(r),
      },
      pivoted,
    };
  }, [mode, numRows]);

  // ----- Row grouping (memory mode only) -----
  const [groupByColumn, setGroupByColumn] = useState<'none' | 'status'>('none');
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(() => new Set());

  const groupedFlat = useMemo<FlatGroupEntry[] | null>(() => {
    if (groupByColumn === 'none') return null;
    if (mode !== 'memory' || !memoryDataset?.materialized) return null;
    const root = groupRows(
      memoryDataset.table,
      { columns: [groupByColumn], openKeys: [] },
      {
        aggregations: [
          { fn: 'sum', columnId: 'revenue', alias: 'revenue' },
          { fn: 'avg', columnId: 'score', alias: 'score' },
          { fn: 'count', columnId: 'rowIndex', alias: '__count' },
        ],
      },
    );
    return flattenGroupTree(root, openGroups);
  }, [groupByColumn, mode, memoryDataset, openGroups]);

  const groupedRowSource = useMemo<RowSource | null>(() => {
    if (!groupedFlat || !memoryDataset?.materialized) return null;
    const flat = groupedFlat;
    const ds = memoryDataset;
    return {
      numRows: flat.length,
      getCell: (rowIndex: number, columnId: string) => {
        const entry = flat[rowIndex];
        if (!entry) return null;
        if (entry.kind === 'row') return ds.rowSource.getCell(entry.rowIndex, columnId);
        return null;
      },
    };
  }, [groupedFlat, memoryDataset]);

  const getRowMeta = useCallback(
    (rowIndex: number): RowMeta | null => {
      if (!groupedFlat) return null;
      const entry = groupedFlat[rowIndex];
      if (!entry || entry.kind !== 'group') return null;
      const node = entry.node;
      const path = pathKey(node.path);
      return {
        kind: 'group',
        depth: entry.depth,
        label: String(node.key ?? '(blank)'),
        path,
        expanded: openGroups.has(path),
        count: node.rowCount,
        aggregates: node.aggregates as Record<string, unknown>,
      };
    },
    [groupedFlat, openGroups],
  );

  const handleToggleGroup = useCallback((path: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const dataReady =
    mode === 'memory'
      ? memoryDataset !== null
      : mode === 'ssrm'
        ? ssrm !== null
        : mode === 'duckdb'
          ? duckdb !== null
          : mode === 'pivot'
            ? pivotResult !== null
            : formula !== null;

  // Module-level stable fallbacks so useOneGrid's effect doesn't re-fire
  // every render while we're waiting for the async data source.
  // Memory-mode columns with the React pill renderer overlaid on
  // the status column. Memoized so the array identity is stable —
  // useOneGrid uses `options.columns` as a dep, and a fresh array
  // each render would constantly remount the Grid.
  const memoryColumnsWithRenderer = useMemo(() => {
    if (!memoryDataset) return null;
    return memoryDataset.columns.map((c) =>
      c.id === 'status' ? { ...c, renderer: statusPillRenderer } : c,
    );
  }, [memoryDataset]);

  const safeColumns: ReadonlyArray<ColumnDef> = !dataReady
    ? EMPTY_COLUMNS
    : mode === 'memory'
      ? memoryColumnsWithRenderer ?? memoryDataset!.columns
      : mode === 'ssrm'
        ? SSRM_COLUMNS
        : mode === 'duckdb'
          ? DUCKDB_COLUMNS
          : mode === 'pivot'
            ? pivotResult!.columns
            : FORMULA_COLUMNS;
  const safeRowSource: RowSource = !dataReady
    ? EMPTY_ROW_SOURCE
    : mode === 'memory'
      ? // Grouped > sorted/filtered view > lazy fallback. The grouped
        // wrapper takes precedence so group headers appear in render order.
        groupedRowSource ?? memoryView?.rowSource ?? memoryDataset!.rowSource
      : mode === 'ssrm'
        ? ssrm!.rowSource
        : mode === 'duckdb'
          ? duckdb!.rowSource
          : mode === 'pivot'
            ? pivotResult!.rowSource
            : formula!.rowSource;
  const safeRowHeight: number | Float32Array =
    mode === 'memory' && memoryDataset ? memoryDataset.heights : 28;

  const handleHeaderClick = useCallback(
    (columnId: string) => {
      setSort((prev) => toggleSortFor(prev, columnId, shiftDown));
    },
    [shiftDown],
  );

  // Master-detail (memory mode only): track which rows are expanded.
  const [expandedRows, setExpandedRows] = useState<ReadonlySet<number>>(() => new Set());

  // Reset expansion when the dataset changes (mode/numRows shift).
  useEffect(() => {
    setExpandedRows(new Set());
  }, [mode, numRows]);

  // Build an HTMLElement-returning detail content function only in memory
  // mode. Other modes don't need it; passing undefined is the off switch.
  const getDetailContent = useMemo<((rowIndex: number) => HTMLElement | null) | undefined>(() => {
    if (mode !== 'memory' || !memoryDataset?.materialized) return undefined;
    return (rowIndex: number): HTMLElement | null => {
      const root = document.createElement('div');
      root.style.cssText =
        'background:#11141a;border-top:1px solid #2a2f37;padding:14px 18px;height:100%;box-sizing:border-box;color:#a5b1c2;font-size:12px;display:flex;flex-direction:column;gap:8px;font-family:ui-sans-serif,system-ui,sans-serif;';

      const title = document.createElement('div');
      title.style.cssText = 'font-weight:600;color:#e7e9ec;font-size:13px;';
      title.textContent = `Row ${String(rowIndex + 1)} · master-detail panel`;
      root.appendChild(title);

      const table = document.createElement('div');
      table.style.cssText = 'display:grid;grid-template-columns:140px 1fr;gap:6px 16px;';
      for (const col of memoryDataset.columns) {
        const k = document.createElement('span');
        k.style.cssText = 'color:#8b929c;';
        k.textContent = String(col.displayName ?? col.id);
        const v = document.createElement('span');
        v.style.cssText = 'font-family:ui-monospace,monospace;color:#e7e9ec;';
        const value = memoryDataset.rowSource.getCell(rowIndex, col.id);
        v.textContent = col.format ? col.format(value, rowIndex) : String(value ?? '');
        table.appendChild(k);
        table.appendChild(v);
      }
      root.appendChild(table);

      const hint = document.createElement('div');
      hint.style.cssText = 'color:#8b929c;font-size:11px;';
      hint.textContent =
        'This panel is a real DOM child of the Grid\u2019s detail layer — interactive widgets (forms, charts, nested grids) drop in here directly.';
      root.appendChild(hint);

      return root;
    };
  }, [mode, memoryDataset]);

  const handleToggleExpand = useCallback((rowIndex: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  }, []);

  // Tick to force a re-render after edits mutate underlying data so the
  // canvas re-reads cells. Used in memory mode (writeCell) and formula
  // mode (applyInput).
  const [editTick, setEditTick] = useState(0);

  // Map a visual row index back to the source row index for the current
  // memory view. Edits/paste arrive in visual coordinates; the underlying
  // typed-array column needs the source row.
  const visualToSourceRow = useCallback(
    (visualRow: number): number => {
      if (memoryView?.permutation) return memoryView.permutation[visualRow] ?? visualRow;
      return visualRow;
    },
    [memoryView],
  );

  const editable = useMemo<
    boolean | ((rowIndex: number, columnId: string) => boolean) | undefined
  >(() => {
    if (mode === 'memory' && memoryDataset?.materialized) {
      return (_row, columnId) => columnId !== 'rowIndex';
    }
    if (mode === 'formula') return true;
    return undefined;
  }, [mode, memoryDataset]);

  const handleCellEdit = useCallback(
    (rowIndex: number, columnId: string, newValue: string): void => {
      if (mode === 'memory' && memoryDataset?.materialized) {
        const sourceRow = visualToSourceRow(rowIndex);
        const ok = memoryDataset.writeCell(sourceRow, columnId, newValue);
        if (ok) setEditTick((t) => t + 1);
        return;
      }
      if (mode === 'formula' && formula) {
        const id = formula.cellIdAt(rowIndex, columnId);
        formula.applyInput(id, newValue);
        setFormulaTick((t) => t + 1);
        return;
      }
    },
    [mode, memoryDataset, formula, visualToSourceRow],
  );

  // Pinned-bottom totals row: only meaningful in materialized memory mode.
  // Numeric columns sum into a single pinned row that lives beneath the
  // scrollable data and tracks live edits via editTick.
  const pinnedBottom = useMemo<RowSource | undefined>(() => {
    if (mode !== 'memory' || !memoryDataset?.materialized) return undefined;
    const totals: Record<string, unknown> = {};
    const numRows = memoryDataset.rowSource.numRows;
    for (const col of memoryDataset.columns) {
      let sum = 0;
      let any = false;
      for (let r = 0; r < numRows; r++) {
        const v = memoryDataset.rowSource.getCell(r, col.id);
        const n = typeof v === 'number' ? v : Number(v);
        if (Number.isFinite(n)) {
          sum += n;
          any = true;
        }
      }
      totals[col.id] = any ? sum : '';
    }
    totals.firstName = 'Σ totals';
    return {
      numRows: 1,
      getCell: (_row, columnId) => totals[columnId] ?? '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, memoryDataset, editTick]);

  // Column groups: only show in memory mode for the materialized dataset.
  // Maps the synthetic schema into three logical groups.
  const columnGroups = useMemo(() => {
    if (mode !== 'memory' || !memoryDataset?.materialized) return undefined;
    return [
      { label: 'Identity', columnIds: ['rowIndex', 'firstName', 'lastName'] },
      { label: 'Activity', columnIds: ['revenue', 'status'] },
      { label: 'Health', columnIds: ['score', 'updatedAt'] },
    ];
  }, [mode, memoryDataset]);

  const handlePaste = useCallback(
    (
      anchorRow: number,
      anchorCol: number,
      pasted: ReadonlyArray<ReadonlyArray<string>>,
    ): void => {
      if (mode === 'memory' && memoryDataset?.materialized) {
        let wrote = false;
        for (let r = 0; r < pasted.length; r++) {
          const row = pasted[r]!;
          const visualRow = anchorRow + r;
          if (visualRow >= safeRowSource.numRows) break;
          const sourceRow = visualToSourceRow(visualRow);
          for (let c = 0; c < row.length; c++) {
            const colIdx = anchorCol + c;
            const column = safeColumns[colIdx];
            if (!column || column.id === 'rowIndex') continue;
            if (memoryDataset.writeCell(sourceRow, column.id, row[c] ?? '')) wrote = true;
          }
        }
        if (wrote) setEditTick((t) => t + 1);
        return;
      }
      if (mode === 'formula' && formula) {
        for (let r = 0; r < pasted.length; r++) {
          const row = pasted[r]!;
          const visualRow = anchorRow + r;
          if (visualRow >= FORMULA_ROW_COUNT) break;
          for (let c = 0; c < row.length; c++) {
            const colIdx = anchorCol + c;
            const colId = indexToColumnId(colIdx);
            if (!colId) continue;
            const cellId = formula.cellIdAt(visualRow, colId);
            formula.applyInput(cellId, row[c] ?? '');
          }
        }
        setFormulaTick((t) => t + 1);
        return;
      }
    },
    [mode, memoryDataset, formula, safeColumns, safeRowSource, visualToSourceRow],
  );

  const { ref, grid } = useOneGrid({
    columns: safeColumns,
    rowSource: safeRowSource,
    rowHeight: safeRowHeight,
    headerHeight: 32,
    frozenColumnCount: mode === 'formula' ? 0 : 1,
    sort,
    expanded: expandedRows,
    detailHeight: 200,
    // Conditionally spread optional callbacks/props so undefined isn't
    // assigned to optional fields (exactOptionalPropertyTypes).
    ...(getDetailContent ? { getDetailContent } : {}),
    ...(editable !== undefined ? { editable } : {}),
    ...(pinnedBottom ? { pinnedBottomRowSource: pinnedBottom } : {}),
    ...(columnGroups ? { columnGroups } : {}),
    ...(groupedFlat ? { getRowMeta, onToggleGroup: handleToggleGroup } : {}),
    statusBar: true,
    onCellEdit: handleCellEdit,
    onPaste: handlePaste,
    onToggleExpand: handleToggleExpand,
    onFrame: (s) => {
      setStats(s);
    },
    onHeaderClick: handleHeaderClick,
    onSelectionChange: (selection) => {
      // In formula mode, mirror the active cell into the formula bar.
      if (mode !== 'formula' || !formula || !selection.active) return;
      const id = formula.cellIdAt(selection.active.row, indexToColumnId(selection.active.col));
      setFormulaActiveCell(id);
      setFormulaInput(formula.getDisplaySource(id));
    },
  });

  // Sync expanded set into the live grid imperatively. Re-creating the
  // grid on every Set identity change would cost a full unmount/remount.
  useEffect(() => {
    grid?.setExpanded(expandedRows);
  }, [grid, expandedRows]);

  // SSRM: when blocks land, ask the grid to repaint. scrollBy(0) is a
  // no-op when scroll position is unchanged, so use the explicit refresh.
  useEffect(() => {
    if (!grid || mode !== 'ssrm') return;
    grid.refresh();
  }, [grid, ssrmTick, mode]);

  // DuckDB: same idea as SSRM — block lands, repaint visible rows.
  useEffect(() => {
    if (!grid || mode !== 'duckdb') return;
    grid.refresh();
  }, [grid, duckdbTick, mode]);

  // Push sort state into the underlying data source. SSRM mode invalidates
  // the row-source cache and refetches; in-memory mode rebuilds memoryView
  // through @onegrid/data's sortIndex on every change.
  useEffect(() => {
    if (!grid) return;
    grid.setSort(sort);
    grid.scrollToRow(0);
    if (mode === 'ssrm' && ssrm) {
      ssrm.handle.setSort(sort);
    }
  }, [sort, grid, mode, ssrm]);

  // SSRM filter wiring: forward the merged FilterModel to the row source,
  // which invalidates blocks and refetches on next read.
  useEffect(() => {
    if (mode !== 'ssrm' || !ssrm) return;
    const columnIds = SSRM_COLUMNS.map((c) => c.id);
    const quick = buildQuickFilter(filterQuery, columnIds);
    const columnar = buildColumnFilter(columnFilters);
    let merged: FilterModel = null;
    if (quick && columnar) {
      merged = { type: 'logical', op: 'and', filters: [quick, columnar] };
    } else {
      merged = quick ?? columnar;
    }
    ssrm.handle.setFilter(merged);
    grid?.scrollToRow(0);
  }, [filterQuery, columnFilters, mode, ssrm, grid]);

  // Memory mode: when sort or filter changes, scroll to top and refresh so
  // the renderer reads through the new permutation.
  useEffect(() => {
    if (mode !== 'memory' || !grid) return;
    grid.scrollToRow(0);
    grid.refresh();
  }, [memoryView, grid, mode]);

  // Memory mode: writeCell mutates underlying typed arrays in place. The
  // canvas reads through getCell on every frame, but we still need to
  // explicitly force one pass after an edit so the cell repaints
  // immediately on commit (rather than waiting for the next scroll).
  useEffect(() => {
    if (mode !== 'memory' || !grid || editTick === 0) return;
    grid.refresh();
  }, [editTick, grid, mode]);

  const addColumnFilter = useCallback(() => {
    const firstColumn = SSRM_COLUMNS[0]?.id ?? 'firstName';
    setColumnFilters((prev) => [...prev, newFilterRule(firstColumn)]);
  }, []);

  const updateColumnFilter = useCallback(
    (id: string, patch: Partial<FilterRule>): void => {
      setColumnFilters((prev) =>
        prev.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
      );
    },
    [],
  );

  const removeColumnFilter = useCallback((id: string): void => {
    setColumnFilters((prev) => prev.filter((rule) => rule.id !== id));
  }, []);

  const clearAllColumnFilters = useCallback(() => {
    setColumnFilters([]);
  }, []);

  // Formula mode: every cell edit bumps formulaTick → grid.refresh() so the
  // canvas re-reads via getCell, which in turn calls engine.getValue (Adapton-
  // style demand-driven recompute). Cells that aren't visible are not
  // recomputed on read.
  useEffect(() => {
    if (mode !== 'formula' || !grid) return;
    grid.refresh();
  }, [grid, mode, formulaTick]);

  const applyFormula = useCallback(() => {
    if (!formula) return;
    formula.applyInput(formulaActiveCell, formulaInput);
    setFormulaTick((t) => t + 1);
    setFormulaInput(formula.getDisplaySource(formulaActiveCell));
  }, [formula, formulaActiveCell, formulaInput]);

  useEffect(() => {
    if (!grid) return;
    window.__onegrid = {
      getMetrics: () => grid.getMetricsSnapshot(),
      reset: () => {
        grid.resetMetrics();
      },
      scrollBy: (dy) => {
        grid.scrollBy(dy);
      },
      scrollToRow: (i) => {
        grid.scrollToRow(i);
      },
      setRows: (n) => {
        setNumRows(n as (typeof ROW_OPTIONS)[number]);
      },
      setSort: (s) => {
        setSort(s);
      },
      getSort: () => sort,
      setFilter: (q) => {
        setFilterQuery(q);
      },
      getFilter: () => filterQuery,
      formulaSet: (id, input) => {
        formula?.applyInput(id, input);
        setFormulaTick((t) => t + 1);
      },
      formulaGet: (id) => formula?.engine.getValue(id),
      formulaStats: () => formula?.engine.getStats(),
    };
    return () => {
      delete window.__onegrid;
    };
  }, [grid]);

  const copyMetrics = (): void => {
    if (!grid) return;
    const snap = grid.getMetricsSnapshot();
    void navigator.clipboard.writeText(JSON.stringify(snap, null, 2));
    console.log('[onegrid] metrics snapshot', snap);
  };

  /** Materialize up to N rows from the active row source for export.
   *  SSRM mode pulls only what's already in the row-source cache. */
  const collectExportData = (
    maxRows = 50_000,
  ): {
    rows: ReadonlyArray<Record<string, unknown>>;
    columns: ReadonlyArray<ExportColumn>;
  } => {
    const exportColumns: ExportColumn[] = safeColumns.map((c) => {
      const fmt = c.format;
      return {
        id: c.id,
        header: c.displayName ?? c.id,
        ...(fmt ? { format: (v: unknown, i: number) => fmt(v, i) } : {}),
      };
    });
    const limit = Math.min(safeRowSource.numRows, maxRows);
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < limit; i++) {
      const row: Record<string, unknown> = {};
      for (const c of safeColumns) row[c.id] = safeRowSource.getCell(i, c.id);
      rows.push(row);
    }
    return { rows, columns: exportColumns };
  };

  const handleExportCsv = (): void => {
    const { rows, columns: cols } = collectExportData();
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(rows, cols, `onegrid-${mode}-${date}.csv`, { bom: true });
  };

  const handleExportXlsx = async (): Promise<void> => {
    const { rows, columns: cols } = collectExportData();
    const date = new Date().toISOString().slice(0, 10);
    await downloadXlsx(rows, cols, `onegrid-${mode}-${date}.xlsx`, {
      sheetName: 'oneGrid Export',
      meta: { title: 'oneGrid export', author: 'oneGrid' },
    });
  };

  return (
    <div className="app">
      <div className="toolbar">
        <h1>oneGrid · v0.0.5</h1>

        <div role="group" aria-label="data source mode">
          <button
            type="button"
            onClick={() => {
              setMode('memory');
            }}
            style={{ fontWeight: mode === 'memory' ? 600 : 400 }}
          >
            In-memory
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              setMode('ssrm');
            }}
            style={{ fontWeight: mode === 'ssrm' ? 600 : 400 }}
          >
            SSRM (localhost:3001)
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              setMode('formula');
            }}
            style={{ fontWeight: mode === 'formula' ? 600 : 400 }}
          >
            Formula
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              setMode('duckdb');
            }}
            style={{ fontWeight: mode === 'duckdb' ? 600 : 400 }}
          >
            DuckDB (in-browser)
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              setMode('pivot');
            }}
            style={{ fontWeight: mode === 'pivot' ? 600 : 400 }}
          >
            Pivot
          </button>
        </div>

        {mode === 'memory' && (
          <>
            <label>
              Rows{' '}
              <select
                value={numRows}
                onChange={(e) => {
                  setNumRows(
                    Number(e.target.value) as (typeof ROW_OPTIONS)[number],
                  );
                }}
              >
                {ROW_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n.toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            <span style={{ color: 'var(--muted)' }}>
              gen {genMs}ms ·{' '}
              {memoryDataset?.materialized
                ? `${safeRowSource.numRows.toLocaleString()} rows`
                : `${numRows.toLocaleString()} rows (lazy — sort/filter disabled)`}
            </span>
            {memoryDataset?.materialized && (
              <>
                <input
                  type="search"
                  placeholder="Quick filter…"
                  value={filterQuery}
                  onChange={(e) => {
                    setFilterQuery(e.target.value);
                  }}
                  style={{ minWidth: 180 }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowFilterPanel((s) => !s);
                  }}
                  style={{ fontWeight: showFilterPanel ? 600 : 400 }}
                >
                  Filters{columnFilters.length > 0 ? ` (${String(columnFilters.length)})` : ''}
                </button>
                <label style={{ color: 'var(--muted)', fontSize: 12 }}>
                  Group by{' '}
                  <select
                    value={groupByColumn}
                    onChange={(e) => {
                      setGroupByColumn(e.target.value as 'none' | 'status');
                      setOpenGroups(new Set());
                    }}
                  >
                    <option value="none">none</option>
                    <option value="status">status</option>
                  </select>
                </label>
              </>
            )}
          </>
        )}

        {mode === 'ssrm' && (
          <>
            <span style={{ color: 'var(--muted)' }}>
              {ssrmStatus === 'connecting' && 'connecting…'}
              {ssrmStatus === 'connected' && ssrm
                ? `${safeRowSource.numRows.toLocaleString()} rows · cache ${String(ssrm.handle.getCacheSize())} blocks`
                : ''}
              {ssrmStatus === 'error' && 'connect failed (start: pnpm dev:server)'}
            </span>
            <input
              type="search"
              placeholder="Quick filter…"
              value={filterQuery}
              onChange={(e) => {
                setFilterQuery(e.target.value);
              }}
              style={{ minWidth: 180 }}
            />
            <button
              type="button"
              onClick={() => {
                setShowFilterPanel((s) => !s);
              }}
              style={{ fontWeight: showFilterPanel ? 600 : 400 }}
            >
              Filters{columnFilters.length > 0 ? ` (${String(columnFilters.length)})` : ''}
            </button>
          </>
        )}

        {mode === 'duckdb' && (
          <span style={{ color: 'var(--muted)' }}>
            {duckdbStatus === 'connecting' && `${duckdbProgress}`}
            {duckdbStatus === 'connected' && duckdb
              ? `${safeRowSource.numRows.toLocaleString()} rows · cache ${String(duckdb.handle.getCacheSize())} blocks`
              : ''}
            {duckdbStatus === 'error' && 'duckdb-wasm load failed (check network/CDN)'}
          </span>
        )}

        {mode === 'formula' && formula && (
          <>
            <span style={{ color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>
              {formulaActiveCell}
            </span>
            <input
              type="text"
              value={formulaInput}
              onChange={(e) => {
                setFormulaInput(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyFormula();
                }
              }}
              placeholder="Type a value or =FORMULA, then Enter…"
              spellCheck={false}
              style={{
                minWidth: 320,
                fontFamily: 'ui-monospace, monospace',
              }}
            />
            <button type="button" onClick={applyFormula}>
              Apply
            </button>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>
              {(() => {
                const stats = formula.engine.getStats();
                return `${String(stats.formulaCount)} formulas · ${String(
                  stats.edgeCount,
                )} edges · ${String(stats.dirtyCount)} dirty`;
              })()}
            </span>
          </>
        )}

        <button
          type="button"
          onClick={() => {
            void runGpuBench();
          }}
          title={gpuStatus}
        >
          GPU bench
        </button>
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>{gpuStatus}</span>

        <button type="button" onClick={copyMetrics}>
          Copy metrics
        </button>
        <button
          type="button"
          onClick={() => {
            grid?.resetMetrics();
          }}
        >
          Reset
        </button>
        <button type="button" onClick={handleExportCsv} disabled={!dataReady}>
          Export CSV
        </button>
        <button
          type="button"
          onClick={() => {
            void handleExportXlsx();
          }}
          disabled={!dataReady}
        >
          Export XLSX
        </button>
        <div className="meter">
          <span>
            FPS <strong>{stats?.fps ?? 0}</strong>
          </span>
          <span>
            draw{' '}
            <strong>{stats ? stats.drawDurationMs.toFixed(1) : '0.0'}</strong> ms
          </span>
          <span>
            visible{' '}
            <strong>
              {stats?.visibleRowStart ?? 0}–{stats?.visibleRowEnd ?? 0}
            </strong>
          </span>
          <span>
            cells/frame <strong>{stats?.drawCellsPerFrame ?? 0}</strong>
          </span>
        </div>
      </div>
      {mode === 'ssrm' && showFilterPanel && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '10px 16px',
            background: 'var(--panel)',
            borderBottom: '1px solid var(--border)',
            fontSize: 12,
          }}
        >
          {columnFilters.length === 0 && (
            <div style={{ color: 'var(--muted)' }}>
              No column filters. Click <strong>Add filter</strong> to narrow with typed comparisons.
            </div>
          )}
          {columnFilters.map((rule) => {
            const opMeta = FILTER_OPS.find((o) => o.op === rule.op);
            return (
              <div
                key={rule.id}
                style={{ display: 'flex', gap: 6, alignItems: 'center' }}
              >
                <select
                  value={rule.columnId}
                  onChange={(e) => {
                    updateColumnFilter(rule.id, { columnId: e.target.value });
                  }}
                >
                  {SSRM_COLUMNS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName ?? c.id}
                    </option>
                  ))}
                </select>
                <select
                  value={rule.op}
                  onChange={(e) => {
                    updateColumnFilter(rule.id, { op: e.target.value as FilterOp });
                  }}
                >
                  {FILTER_OPS.map((o) => (
                    <option key={o.op} value={o.op}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder={isUnaryOp(rule.op) ? '(no value)' : 'value'}
                  value={rule.value}
                  disabled={isUnaryOp(rule.op)}
                  onChange={(e) => {
                    updateColumnFilter(rule.id, { value: e.target.value });
                  }}
                  style={{
                    flex: '0 1 240px',
                    opacity: isUnaryOp(rule.op) || opMeta ? 1 : 0.5,
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    removeColumnFilter(rule.id);
                  }}
                  aria-label="remove filter"
                >
                  ×
                </button>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={addColumnFilter}>
              + Add filter
            </button>
            {columnFilters.length > 0 && (
              <button type="button" onClick={clearAllColumnFilters}>
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div
          ref={ref}
          style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
        />
        {!dataReady && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted)',
              pointerEvents: 'none',
            }}
          >
            {mode === 'ssrm'
              ? 'connecting to SSRM…'
              : mode === 'duckdb'
                ? `duckdb-wasm: ${duckdbProgress || 'starting…'}`
                : 'loading…'}
          </div>
        )}
      </div>
    </div>
  );
};
