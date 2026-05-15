// =============================================================================
// V0.0.10 demo panel — exercises the four user-visible v0.0.10 features:
//
//   - @onegrid/sparklines: line + bar + winloss canvas paints
//   - @onegrid/data-worker: in-process worker pair running a 100k-row sort
//   - @onegrid/dbsp: incremental groupAgg — stream rows in, see partial sums update
//   - @onegrid/formula BigInt path: addNumeric of two large bigints stays exact
//
// Column virtualization, adaptive overscan, and rAF discipline are renderer-
// internal and have no separate visible surface; they're exercised by every
// existing playground mode via @onegrid/core.
// =============================================================================

import { useEffect, useMemo, useRef, useState, type JSX } from 'react';

import { drawSparkline } from '@onegrid/sparklines';
import {
  createGroupAgg,
  type Diff,
} from '@onegrid/dbsp';
import { parseFormula, evaluate } from '@onegrid/formula';
import { sortIndex, createColumnTable } from '@onegrid/data';
import {
  WorkerPluginHost,
  type WorkerLike,
} from '@onegrid/worker-plugins';
import { definePluginWorker, type WorkerSelfLike } from '@onegrid/worker-plugins/worker';

// -----------------------------------------------------------------------------
// In-process worker pair — same pattern used in v009-demo. Production code
// would spawn a real Worker; the playground keeps things side-effect-free.
// -----------------------------------------------------------------------------

function inProcessWorkerPair(): {
  hostSide: WorkerLike;
  startWorker: () => () => void;
} {
  const hostListeners = new Map<string, Set<(e: unknown) => void>>();
  const workerListeners = new Map<string, Set<(e: unknown) => void>>();
  const emit = (
    m: Map<string, Set<(e: unknown) => void>>,
    type: string,
    e: unknown,
  ): void => {
    m.get(type)?.forEach((fn) => fn(e));
  };
  const hostSide = {
    postMessage: (msg: unknown) => emit(workerListeners, 'message', { data: msg }),
    addEventListener: (type: string, listener: (e: unknown) => void) => {
      let set = hostListeners.get(type);
      if (!set) hostListeners.set(type, (set = new Set()));
      set.add(listener);
    },
    removeEventListener: (type: string, listener: unknown) =>
      hostListeners.get(type)?.delete(listener as (e: unknown) => void),
    terminate: () => {
      hostListeners.clear();
      workerListeners.clear();
    },
  } as unknown as WorkerLike;
  const workerSide = {
    postMessage: (msg: unknown) => emit(hostListeners, 'message', { data: msg }),
    addEventListener: (type: string, listener: (e: unknown) => void) => {
      let set = workerListeners.get(type);
      if (!set) workerListeners.set(type, (set = new Set()));
      set.add(listener);
    },
    removeEventListener: (type: string, listener: unknown) =>
      workerListeners.get(type)?.delete(listener as (e: unknown) => void),
  } as unknown as WorkerSelfLike;
  return {
    hostSide,
    startWorker: () =>
      definePluginWorker({
        self: workerSide,
        handlers: {
          // Mimic @onegrid/data-worker's `sort` handler. In production
          // this is the standard handler from @onegrid/data-worker/worker.
          sort: (input: {
            readonly table: ReturnType<typeof createColumnTable>;
            readonly sort: Parameters<typeof sortIndex>[1];
          }) => sortIndex(input.table, input.sort),
        },
      }),
  };
}

// -----------------------------------------------------------------------------
// V010Demo
// -----------------------------------------------------------------------------

export function V010Demo(): JSX.Element {
  const sparklineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [bigIntResult, setBigIntResult] = useState<string | null>(null);
  const [dbspResult, setDbspResult] = useState<{ us: number; eu: number } | null>(
    null,
  );
  const [dbspDelta, setDbspDelta] = useState<{ us: number; eu: number } | null>(
    null,
  );
  const [sortMs, setSortMs] = useState<number | null>(null);
  const [sortHead, setSortHead] = useState<number[] | null>(null);

  const hostRef = useRef<WorkerPluginHost | null>(null);

  // -- Worker setup with deferred boot so the ready handshake doesn't race --
  useEffect(() => {
    const { hostSide, startWorker } = inProcessWorkerPair();
    const host = new WorkerPluginHost({ worker: hostSide, timeoutMs: 30_000 });
    hostRef.current = host;
    const teardown = startWorker();
    return () => {
      host.dispose();
      teardown();
    };
  }, []);

  // -- Build the demo data set once --
  const { sortTable, dbspRowsBatch1, dbspRowsBatch2 } = useMemo(() => {
    // 100k-row table: random scores so the sort produces a deterministic
    // permutation we can sample-assert on.
    const N = 100_000;
    const scores = new Float64Array(N);
    let s = 1234;
    for (let i = 0; i < N; i++) {
      // xorshift32
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      scores[i] = (s >>> 0) / 0xffffffff;
    }
    const sortTable = createColumnTable([
      {
        schema: { id: 'id', type: 'int32' },
        data: Int32Array.from({ length: N }, (_, i) => i),
      },
      { schema: { id: 'score', type: 'float64' }, data: scores },
    ]);

    // DBSP demo: two batches of inserts so we can observe incremental
    // recompute. First batch fills the partition totals; second batch
    // tops them up. Aggregated by region with sum(amount).
    const dbspRowsBatch1: Diff = {
      entries: [
        { key: 'r1', row: { region: 'us', amount: 100 }, weight: 1 },
        { key: 'r2', row: { region: 'us', amount: 200 }, weight: 1 },
        { key: 'r3', row: { region: 'eu', amount: 50 }, weight: 1 },
      ],
    };
    const dbspRowsBatch2: Diff = {
      entries: [
        { key: 'r4', row: { region: 'us', amount: 300 }, weight: 1 },
        { key: 'r5', row: { region: 'eu', amount: 25 }, weight: 1 },
      ],
    };
    return { sortTable, dbspRowsBatch1, dbspRowsBatch2 };
  }, []);

  // -- Sparklines: paint three small charts into one canvas on mount --
  useEffect(() => {
    const canvas = sparklineCanvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = 240 * ratio;
    canvas.height = 72 * ratio;
    canvas.style.width = '240px';
    canvas.style.height = '72px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, 240, 72);

    const minCtx = ctx as unknown as Parameters<typeof drawSparkline>[0];
    drawSparkline(minCtx, { x: 0, y: 0, width: 240, height: 24 }, [3, 5, 2, 8, 6, 4, 9, 7, 10], 'line', {
      area: true,
      highlightExtrema: true,
      color: '#0969da',
    });
    drawSparkline(
      minCtx,
      { x: 0, y: 24, width: 240, height: 24 },
      [3, -2, 5, -1, 6, 4, -3, 7, 2],
      'bar',
      { color: '#1a7f37', negativeColor: '#cf222e' },
    );
    drawSparkline(
      minCtx,
      { x: 0, y: 48, width: 240, height: 24 },
      [1, 1, -1, 0, 1, -1, 1, 1, -1],
      'winloss',
      { color: '#1a7f37', negativeColor: '#cf222e' },
    );
  }, []);

  // -- BigInt formula: A1 + B1 through the public engine path,
  //    where A1 = 2^53 + 1 and B1 = 1. Stays exact (would be
  //    2^53 + 2 displayed as 9007199254740994 in Number = wrong). --
  const handleBigIntClick = (): void => {
    const ast = parseFormula('A1+B1');
    const r = evaluate(ast, {
      getCell: (ref) => (ref === 'A1' ? 9_007_199_254_740_993n : 1n),
      getRange: () => [],
    });
    setBigIntResult(String(r));
  };

  // -- DBSP: run two incremental batches and report partial sums after each --
  const handleDbspClick = (): void => {
    const op = createGroupAgg(
      ['region'],
      [{ out: 'total', src: 'amount', kind: 'sum' }],
    );
    op.applyDiff(dbspRowsBatch1);
    const snap1 = op.snapshot();
    const us1 = Number((snap1.get('us') as { total: number } | undefined)?.total ?? 0);
    const eu1 = Number((snap1.get('eu') as { total: number } | undefined)?.total ?? 0);
    setDbspResult({ us: us1, eu: eu1 });

    op.applyDiff(dbspRowsBatch2);
    const snap2 = op.snapshot();
    const us2 = Number((snap2.get('us') as { total: number } | undefined)?.total ?? 0);
    const eu2 = Number((snap2.get('eu') as { total: number } | undefined)?.total ?? 0);
    setDbspDelta({ us: us2, eu: eu2 });
  };

  // -- Worker sort: 100k rows by score ascending. Timing assertion in spec. --
  const handleWorkerSortClick = async (): Promise<void> => {
    const host = hostRef.current;
    if (!host) return;
    await host.ready;
    const t0 = performance.now();
    const indices = (await host.invoke<Int32Array>('sort', [
      {
        table: sortTable,
        sort: [{ columnId: 'score', direction: 'asc' }],
      },
    ])) as unknown as Int32Array;
    const t1 = performance.now();
    setSortMs(Math.round(t1 - t0));
    // Sample the first 5 sorted ids — should reflect the lowest-score rows.
    setSortHead(Array.from(indices.slice(0, 5)));
  };

  return (
    <aside
      data-testid="v010-demo"
      style={{
        display: 'grid',
        gap: 8,
        minWidth: 320,
        maxWidth: 380,
        padding: 8,
        fontSize: 12,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 15 }} data-testid="v010-title">
        v0.0.10 Demo
      </h2>

      {/* Sparklines */}
      <div>
        <div style={{ fontWeight: 600 }}>Sparklines (line / bar / winloss)</div>
        <canvas ref={sparklineCanvasRef} data-testid="v010-sparkline-canvas" />
      </div>

      {/* BigInt formula */}
      <div>
        <button
          type="button"
          data-testid="v010-bigint-run"
          onClick={handleBigIntClick}
        >
          BigInt: 2^53 + 1 + 1
        </button>{' '}
        <span data-testid="v010-bigint-result">
          {bigIntResult ?? 'click to run'}
        </span>
      </div>

      {/* DBSP incremental */}
      <div>
        <button
          type="button"
          data-testid="v010-dbsp-run"
          onClick={handleDbspClick}
        >
          DBSP: groupAgg two batches
        </button>{' '}
        <span data-testid="v010-dbsp-result">
          {dbspResult ? `after #1: us=${dbspResult.us} eu=${dbspResult.eu}` : '—'}
        </span>{' '}
        <span data-testid="v010-dbsp-delta">
          {dbspDelta ? `after #2: us=${dbspDelta.us} eu=${dbspDelta.eu}` : '—'}
        </span>
      </div>

      {/* Worker sort */}
      <div>
        <button
          type="button"
          data-testid="v010-worker-sort-run"
          onClick={() => {
            void handleWorkerSortClick();
          }}
        >
          Worker: sort 100k rows by score
        </button>{' '}
        <span data-testid="v010-worker-sort-result">
          {sortMs !== null && sortHead ? `${sortMs}ms · head=[${sortHead.join(',')}]` : '—'}
        </span>
      </div>
    </aside>
  );
}
