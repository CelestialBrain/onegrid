import { useEffect, useMemo, useState, type JSX } from 'react';
import {
  useOneGrid,
  type ColumnDef,
  type FrameStats,
  type MetricsSnapshot,
  type RowSource,
} from '@onegrid/react';
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
    };
  }
}

export const App = (): JSX.Element => {
  const [mode, setMode] = useState<Mode>('memory');
  const [numRows, setNumRows] = useState<(typeof ROW_OPTIONS)[number]>(1_000_000);
  const [genMs, setGenMs] = useState<number>(0);
  const [stats, setStats] = useState<FrameStats | null>(null);

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

  const { ref, grid } = useOneGrid({
    columns: safeColumns,
    rowSource: safeRowSource,
    rowHeight: safeRowHeight,
    headerHeight: 32,
    frozenColumnCount: 1,
    onFrame: (s) => {
      setStats(s);
    },
  });

  // SSRM: when blocks land, ask the grid to repaint. scrollBy(0) is a
  // no-op when scroll position is unchanged, so use the explicit refresh.
  useEffect(() => {
    if (!grid || mode !== 'ssrm') return;
    grid.refresh();
  }, [grid, ssrmTick, mode]);

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
