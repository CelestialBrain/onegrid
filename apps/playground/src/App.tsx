import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import {
  useOneGrid,
  type ColumnDef,
  type FrameStats,
  type MetricsSnapshot,
  type RowSource,
  type SortModel,
} from '@onegrid/react';
import { downloadCsv, downloadXlsx, type ExportColumn } from '@onegrid/export';
import { generateSynthetic } from './lib/synthetic';
import { connectSsrm, SSRM_COLUMNS, type SsrmConnection } from './lib/ssrm';

const ROW_OPTIONS = [1_000, 10_000, 100_000, 1_000_000, 10_000_000] as const;

type Mode = 'memory' | 'ssrm';

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
  const memoryDataset = useMemo(() => {
    if (mode !== 'memory') return null;
    const t0 = performance.now();
    const d = generateSynthetic(numRows);
    const t1 = performance.now();
    setGenMs(Math.round(t1 - t0));
    return d;
  }, [mode, numRows]);

  // ----- ssrm connection -----
  const [ssrm, setSsrm] = useState<SsrmConnection | null>(null);
  const [ssrmStatus, setSsrmStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>(
    'idle',
  );
  const [ssrmTick, setSsrmTick] = useState(0);

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

  const dataReady = mode === 'memory' ? memoryDataset !== null : ssrm !== null;

  // Module-level stable fallbacks so useOneGrid's effect doesn't re-fire
  // every render while we're waiting for the async data source.
  const safeColumns: ReadonlyArray<ColumnDef> = dataReady
    ? mode === 'memory'
      ? memoryDataset!.columns
      : SSRM_COLUMNS
    : EMPTY_COLUMNS;
  const safeRowSource: RowSource = dataReady
    ? mode === 'memory'
      ? memoryDataset!.rowSource
      : ssrm!.rowSource
    : EMPTY_ROW_SOURCE;
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
    frozenColumnCount: 1,
    sort,
    onFrame: (s) => {
      setStats(s);
    },
    onHeaderClick: handleHeaderClick,
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
            <span style={{ color: 'var(--muted)' }}>generate: {genMs} ms</span>
          </>
        )}

        {mode === 'ssrm' && (
          <span style={{ color: 'var(--muted)' }}>
            {ssrmStatus === 'connecting' && 'connecting…'}
            {ssrmStatus === 'connected' && ssrm
              ? `${ssrm.numRows.toLocaleString()} rows · cache ${String(ssrm.handle.getCacheSize())} blocks`
              : ''}
            {ssrmStatus === 'error' && 'connect failed (start: pnpm dev:server)'}
          </span>
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
