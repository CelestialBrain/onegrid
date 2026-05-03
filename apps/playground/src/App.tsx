import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { CanvasGrid, type FrameStats, type MetricsSnapshot } from './spike/CanvasGrid';
import { generateSynthetic } from './spike/synthetic';

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

const ROW_OPTIONS = [1_000, 10_000, 100_000, 1_000_000, 10_000_000] as const;

export const App = (): JSX.Element => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<CanvasGrid | null>(null);
  const [numRows, setNumRows] = useState<(typeof ROW_OPTIONS)[number]>(1_000_000);
  const [genMs, setGenMs] = useState<number>(0);
  const [stats, setStats] = useState<FrameStats | null>(null);

  const dataset = useMemo(() => {
    const t0 = performance.now();
    const d = generateSynthetic(numRows);
    const t1 = performance.now();
    setGenMs(Math.round(t1 - t0));
    return d;
  }, [numRows]);

  useEffect(() => {
    if (!hostRef.current) return;
    const grid = new CanvasGrid({
      host: hostRef.current,
      data: dataset,
      onFrame: (s) => {
        setStats(s);
      },
    });
    gridRef.current = grid;
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
      grid.destroy();
      gridRef.current = null;
      delete window.__onegrid;
    };
  }, [dataset]);

  const copyMetrics = (): void => {
    const grid = gridRef.current;
    if (!grid) return;
    const snap = grid.getMetricsSnapshot();
    void navigator.clipboard.writeText(JSON.stringify(snap, null, 2));
    console.log('[onegrid] metrics snapshot', snap);
  };

  return (
    <div className="app">
      <div className="toolbar">
        <h1>oneGrid · Phase 0 Spike A</h1>
        <label>
          Rows{' '}
          <select
            value={numRows}
            onChange={(e) => setNumRows(Number(e.target.value) as (typeof ROW_OPTIONS)[number])}
          >
            {ROW_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <span style={{ color: 'var(--muted)' }}>generate: {genMs} ms</span>
        <button type="button" onClick={copyMetrics}>
          Copy metrics
        </button>
        <button type="button" onClick={() => gridRef.current?.resetMetrics()}>
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
      <div className="grid-host" ref={hostRef} />
    </div>
  );
};
