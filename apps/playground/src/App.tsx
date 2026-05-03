import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { CanvasGrid, type FrameStats } from './spike/CanvasGrid';
import { generateSynthetic } from './spike/synthetic';

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
      onFrame: (s) => setStats(s),
    });
    gridRef.current = grid;
    return () => {
      grid.destroy();
      gridRef.current = null;
    };
  }, [dataset]);

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
