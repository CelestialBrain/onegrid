import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import {
  useOneGrid,
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
import { connectSsrm, SSRM_COLUMNS, type SsrmConnection } from './lib/ssrm';
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
  indexToColumnId,
  type FormulaPlaygroundHandle,
} from './lib/formula-mode';

const ROW_OPTIONS = [1_000, 10_000, 100_000, 1_000_000, 10_000_000] as const;

type Mode = 'memory' | 'ssrm' | 'formula';

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

  const dataReady =
    mode === 'memory'
      ? memoryDataset !== null
      : mode === 'ssrm'
        ? ssrm !== null
        : formula !== null;

  // Module-level stable fallbacks so useOneGrid's effect doesn't re-fire
  // every render while we're waiting for the async data source.
  const safeColumns: ReadonlyArray<ColumnDef> = !dataReady
    ? EMPTY_COLUMNS
    : mode === 'memory'
      ? memoryDataset!.columns
      : mode === 'ssrm'
        ? SSRM_COLUMNS
        : FORMULA_COLUMNS;
  const safeRowSource: RowSource = !dataReady
    ? EMPTY_ROW_SOURCE
    : mode === 'memory'
      ? // Use the sorted/filtered view when available; fall back to the
        // lazy rowSource for 10M-row mode (no materialization).
        memoryView?.rowSource ?? memoryDataset!.rowSource
      : mode === 'ssrm'
        ? ssrm!.rowSource
        : formula!.rowSource;
  const safeRowHeight: number | Float32Array =
    mode === 'memory' && memoryDataset ? memoryDataset.heights : 28;

  const handleHeaderClick = useCallback(
    (columnId: string) => {
      setSort((prev) => toggleSortFor(prev, columnId, shiftDown));
    },
    [shiftDown],
  );

  const { ref, grid } = useOneGrid({
    columns: safeColumns,
    rowSource: safeRowSource,
    rowHeight: safeRowHeight,
    headerHeight: 32,
    frozenColumnCount: mode === 'formula' ? 0 : 1,
    sort,
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

  // SSRM: when blocks land, ask the grid to repaint. scrollBy(0) is a
  // no-op when scroll position is unchanged, so use the explicit refresh.
  useEffect(() => {
    if (!grid || mode !== 'ssrm') return;
    grid.refresh();
  }, [grid, ssrmTick, mode]);

  // Push sort state into the underlying data source. SSRM mode invalidates
  // the row-source cache and refetches; in-memory mode is visual-only for
  // now (sorting an in-memory dataset is a v0.0.4 follow-up).
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
        <h1>oneGrid · v0.0.3</h1>

        <div role="tablist" aria-label="data source mode">
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
            {mode === 'ssrm' ? 'connecting to SSRM…' : 'loading…'}
          </div>
        )}
      </div>
    </div>
  );
};
