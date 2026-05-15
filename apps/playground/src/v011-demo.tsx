// =============================================================================
// V0.0.11 demo panel — exercises the moats milestone:
//
//   - @onegrid/mcp: send a tools/list JSON-RPC + a tools/call(set_sort)
//   - @onegrid/temporal: append 3 diffs, snapshotAt past versions, undo
//   - @onegrid/ai: parseIntentHeuristic on a user-typed query (no LLM)
//   - @onegrid/crdt: drive the fake Y.Map through bindYjsRows, see diffs flow
//   - @onegrid/reactive: build a 3-node graph; toggle an input; observe the
//     compute-count delta to prove backdating
//
// @onegrid/orm-sync is type-only glue — exercised by the v0.0.8 CDC adapters
// in their own integration tests. No separate visible surface.
// =============================================================================

import { useMemo, useRef, useState, type JSX } from 'react';

import {
  createMcpServer,
  type JsonRpcRequest,
} from '@onegrid/mcp';
import { TemporalLog, invertDiff, applyDiffToSnapshot } from '@onegrid/temporal';
import { parseIntentHeuristic, type Intent } from '@onegrid/ai';
import {
  bindYjsRows,
  applyLocalToYjs,
  type YMapLike,
  type YMapEventLike,
} from '@onegrid/crdt';
import { Database } from '@onegrid/reactive';
import type { ColumnSchema, RowDiff } from '@onegrid/protocol';

// -----------------------------------------------------------------------------
// Fake Y.Map — minimum surface bindYjsRows reads.
// -----------------------------------------------------------------------------

function makeFakeYMap(): {
  map: YMapLike;
  fire: (
    changes: ReadonlyMap<string, { action: 'add' | 'update' | 'delete' }>,
  ) => void;
} {
  const data = new Map<string, unknown>();
  const handlers = new Set<(e: YMapEventLike) => void>();
  const map: YMapLike = {
    get: (k) => data.get(k),
    set: (k, v) => {
      const action: 'add' | 'update' = data.has(k) ? 'update' : 'add';
      data.set(k, v);
      const keys = new Map<string, { action: 'add' | 'update' | 'delete' }>([
        [k, { action }],
      ]);
      handlers.forEach((h) => h({ changes: { keys } }));
    },
    delete: (k) => {
      data.delete(k);
      const keys = new Map<string, { action: 'add' | 'update' | 'delete' }>([
        [k, { action: 'delete' }],
      ]);
      handlers.forEach((h) => h({ changes: { keys } }));
    },
    entries: () => data.entries(),
    observe: (h) => {
      handlers.add(h);
    },
    unobserve: (h) => {
      handlers.delete(h);
    },
  };
  return {
    map,
    fire: (changes) => handlers.forEach((h) => h({ changes: { keys: changes } })),
  };
}

// -----------------------------------------------------------------------------
// V011Demo
// -----------------------------------------------------------------------------

const DEMO_SCHEMA: ColumnSchema[] = [
  { id: 'id', type: 'int32' },
  { id: 'name', type: 'utf8' },
  { id: 'amount', type: 'float64' },
];

export function V011Demo(): JSX.Element {
  // -- MCP: build a server backed by a fake bridge, send two JSON-RPC calls
  const [mcpToolList, setMcpToolList] = useState<string[] | null>(null);
  const [mcpSortApplied, setMcpSortApplied] = useState<string | null>(null);

  const mcpServer = useMemo(() => {
    let currentSort: ReadonlyArray<{ columnId: string; direction: 'asc' | 'desc' }> =
      [];
    return createMcpServer({
      bridge: {
        getColumns: () => DEMO_SCHEMA.map((c) => ({
          id: c.id, displayName: c.id, type: c.type,
        })),
        getSort: () => currentSort,
        getFilter: () => null,
        getSelection: () => null,
        getViewport: () => ({ visibleRowStart: 0, visibleRowEnd: 29, totalRowCount: 100 }),
        setSort: (sort) => {
          currentSort = sort;
        },
        setFilter: () => {},
        scrollToRow: () => {},
        readBlock: async () => [],
        selectRange: () => {},
        onMutation: () => {},
      },
    });
  }, []);

  const handleMcpClick = async (): Promise<void> => {
    const listReq: JsonRpcRequest = {
      jsonrpc: '2.0', id: 1, method: 'tools/list',
    };
    const listResp = await mcpServer.handle(listReq);
    if ('result' in listResp) {
      const result = listResp.result as { tools: ReadonlyArray<{ name: string }> };
      setMcpToolList(result.tools.map((t) => t.name).slice(0, 4));
    }
    const callReq: JsonRpcRequest = {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: {
        name: 'set_sort',
        arguments: { sort: [{ columnId: 'amount', direction: 'desc' }] },
      },
    };
    const callResp = await mcpServer.handle(callReq);
    if ('result' in callResp) setMcpSortApplied('amount desc');
  };

  // -- Temporal: append, snapshotAt past, invertDiff round-trip --
  const [temporalState, setTemporalState] = useState<{
    head: number;
    atV1: string;
    afterUndo: string;
  } | null>(null);

  const handleTemporalClick = (): void => {
    const log = new TemporalLog();
    log.append({ kind: 'insert', version: 1, pkey: 'r1', fields: { x: 1 } });
    log.append({ kind: 'update', version: 2, pkey: 'r1', fields: { x: 2 } });
    log.append({ kind: 'update', version: 3, pkey: 'r1', fields: { x: 3 } });

    const snapV1 = log.snapshotAt(1);
    const atV1Row = snapV1.get('r1') as { x: number };

    // Undo: invert v2..v3 and apply backwards.
    const undos: RowDiff[] = [];
    for (const d of log.diffBetween(1, 3)) {
      const preSnap = log.snapshotAt(d.version - 1);
      undos.unshift(invertDiff(d, preSnap));
    }
    const replay = log.snapshotAt(3);
    for (const u of undos) applyDiffToSnapshot(replay, u);
    const afterUndoRow = replay.get('r1') as { x: number };
    setTemporalState({
      head: log.headVersion,
      atV1: String(atV1Row.x),
      afterUndo: String(afterUndoRow.x),
    });
  };

  // -- AI: parse a natural-language query with the heuristic fallback --
  const [aiInput, setAiInput] = useState<string>('amount >= 100');
  const aiIntents = useMemo<ReadonlyArray<Intent>>(
    () => parseIntentHeuristic(aiInput, DEMO_SCHEMA).intents,
    [aiInput],
  );

  // -- CRDT: fake Y.Map; bindYjsRows; apply two local edits + observe --
  const [crdtLog, setCrdtLog] = useState<string[]>([]);
  const handleCrdtClick = (): void => {
    const { map } = makeFakeYMap();
    const seen: string[] = [];
    bindYjsRows({
      map,
      onDiff: (d) => seen.push(`${d.kind}:${String(d.pkey)}`),
    });
    applyLocalToYjs(map, { kind: 'insert', pkey: 'r1', fields: { x: 1 } });
    applyLocalToYjs(map, { kind: 'update', pkey: 'r1', fields: { x: 2 } });
    applyLocalToYjs(map, { kind: 'delete', pkey: 'r1' });
    setCrdtLog(seen);
  };

  // -- Reactive: 3-node graph; toggle an input; observe backdating prevents
  //    downstream recompute when upstream re-derives to the same value. --
  const computeCountsRef = useRef({ upstream: 0, downstream: 0 });
  const [reactiveStats, setReactiveStats] = useState<{
    upstream: number;
    downstream: number;
    finalValue: number;
  } | null>(null);

  const handleReactiveClick = (): void => {
    computeCountsRef.current = { upstream: 0, downstream: 0 };
    const db = new Database();
    const x = db.defineInput('x', 5);
    const constish = db.defineQuery<undefined, number>('constish', () => {
      computeCountsRef.current.upstream++;
      return Math.abs(x.get());
    });
    const downstream = db.defineQuery<undefined, number>('downstream', () => {
      computeCountsRef.current.downstream++;
      return constish(undefined) + 1;
    });

    // Initial computation
    downstream(undefined);
    // Toggle input — Math.abs(-5) === Math.abs(5), so backdating fires.
    x.set(-5);
    downstream(undefined);
    // Toggle back.
    x.set(5);
    downstream(undefined);

    setReactiveStats({
      ...computeCountsRef.current,
      finalValue: downstream(undefined),
    });
  };

  return (
    <aside
      data-testid="v011-demo"
      style={{
        display: 'grid',
        gap: 8,
        minWidth: 320,
        maxWidth: 380,
        padding: 8,
        fontSize: 12,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 15 }} data-testid="v011-title">
        v0.0.11 Demo
      </h2>

      {/* MCP */}
      <div>
        <button
          type="button"
          data-testid="v011-mcp-run"
          onClick={() => {
            void handleMcpClick();
          }}
        >
          MCP: tools/list + tools/call(set_sort)
        </button>
        <div data-testid="v011-mcp-tools" style={{ opacity: 0.8 }}>
          {mcpToolList ? `tools = ${mcpToolList.join(', ')}…` : '—'}
        </div>
        <div data-testid="v011-mcp-sort" style={{ opacity: 0.8 }}>
          {mcpSortApplied ? `sort applied: ${mcpSortApplied}` : '—'}
        </div>
      </div>

      {/* Temporal */}
      <div>
        <button
          type="button"
          data-testid="v011-temporal-run"
          onClick={handleTemporalClick}
        >
          Temporal: snapshotAt + undo round-trip
        </button>
        <div data-testid="v011-temporal-result" style={{ opacity: 0.8 }}>
          {temporalState
            ? `head=v${String(temporalState.head)} · @v1.x=${temporalState.atV1} · after undo=${temporalState.afterUndo}`
            : '—'}
        </div>
      </div>

      {/* AI heuristic */}
      <div>
        <div>
          <input
            value={aiInput}
            data-testid="v011-ai-input"
            onChange={(e) => setAiInput(e.target.value)}
            style={{ width: 180, fontSize: 12 }}
            placeholder="amount >= 100"
          />{' '}
          <span data-testid="v011-ai-count" style={{ opacity: 0.8 }}>
            {aiIntents.length} intent(s)
          </span>
        </div>
        <div data-testid="v011-ai-kind" style={{ opacity: 0.8 }}>
          {aiIntents[0]?.kind ?? '—'}
        </div>
      </div>

      {/* CRDT */}
      <div>
        <button
          type="button"
          data-testid="v011-crdt-run"
          onClick={handleCrdtClick}
        >
          CRDT: 3 local edits → diff stream
        </button>
        <div data-testid="v011-crdt-log" style={{ opacity: 0.8 }}>
          {crdtLog.length > 0 ? crdtLog.join(' · ') : '—'}
        </div>
      </div>

      {/* Reactive */}
      <div>
        <button
          type="button"
          data-testid="v011-reactive-run"
          onClick={handleReactiveClick}
        >
          Reactive: backdating cascade-protection
        </button>
        <div data-testid="v011-reactive-stats" style={{ opacity: 0.8 }}>
          {reactiveStats
            ? `upstream=${reactiveStats.upstream} · downstream=${reactiveStats.downstream} · final=${reactiveStats.finalValue}`
            : '—'}
        </div>
      </div>
    </aside>
  );
}
