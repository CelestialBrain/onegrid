// =============================================================================
// Moats — AI, MCP, reactive, dbsp, worker-plugins, data-worker, orm-sync.
// Packages that aren't on any other grid.
// =============================================================================

import { useMemo, useState, type JSX } from 'react';
import * as ai from '@onegrid/ai';
import * as mcp from '@onegrid/mcp';
import * as reactive from '@onegrid/reactive';
import * as dbsp from '@onegrid/dbsp';
import * as workerPlugins from '@onegrid/worker-plugins';
import * as dataWorker from '@onegrid/data-worker';
import * as ormSync from '@onegrid/orm-sync';
import { Btn, Card, Mono, Output } from '../ui';

export function MoatsTab(): JSX.Element {
  return (
    <div>
      <ReactiveSection />
      <DbspSection />
      <AiSection />
      <McpSection />
      <SurfaceSection />
    </div>
  );
}

function ReactiveSection(): JSX.Element {
  const [tick, setTick] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  const demo = useMemo(() => {
    if (typeof (reactive as { Database?: unknown }).Database !== 'function') return null;
    const { Database } = reactive as unknown as {
      Database: new () => {
        cell: (id: string, fn: () => unknown, eq?: (a: unknown, b: unknown) => boolean) => { read: () => unknown };
        setInput: (id: string, value: unknown) => void;
      };
    };
    const db = new Database();
    return db;
  }, []);

  function runCycle() {
    if (!demo) return;
    demo.setInput('a', tick + 1);
    demo.setInput('b', (tick + 1) * 2);
    const sum = demo.cell('sum', () => {
      const a = Number(demo.cell('a', () => 0).read());
      const b = Number(demo.cell('b', () => 0).read());
      return a + b;
    }).read();
    setLog((l) => [...l, `tick ${tick + 1}: a=${tick + 1}, b=${(tick + 1) * 2}, sum=${sum}`]);
    setTick((t) => t + 1);
  }

  return (
    <Card title="@onegrid/reactive — Salsa-style on-demand memoization (v0.0.11)">
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
        Salsa-style reactive substrate. Cells recompute lazily on read; the
        formula engine's Adapton path is scheduled to migrate onto this in
        v0.0.11.x.
      </div>
      <Btn onClick={runCycle}>tick</Btn>
      <div style={{ marginTop: 8 }}>
        <Output>{log.length === 0 ? '(click tick)' : log.join('\n')}</Output>
      </div>
    </Card>
  );
}

function DbspSection(): JSX.Element {
  const result = useMemo(() => {
    if (typeof (dbsp as { coalesce?: unknown }).coalesce !== 'function') return null;
    const { coalesce, integrate } = dbsp as unknown as {
      coalesce: (entries: ReadonlyArray<{ key: string; weight: number; row: Record<string, unknown> }>) => unknown;
      integrate: (diffs: ReadonlyArray<unknown>) => Map<string, Record<string, unknown>>;
    };
    // Simulate a Z-set with three insertions and one retraction.
    const entries = [
      { key: 'r1', weight: 1, row: { id: 'r1', name: 'Alice' } },
      { key: 'r2', weight: 1, row: { id: 'r2', name: 'Bob' } },
      { key: 'r3', weight: 1, row: { id: 'r3', name: 'Carol' } },
      { key: 'r1', weight: -1, row: { id: 'r1', name: 'Alice' } },
      { key: 'r1', weight: 1, row: { id: 'r1', name: 'Alice Lovelace' } },
    ];
    const coalesced = coalesce(entries);
    const integrated = integrate([{ entries }]);
    return { coalesced, integrated: Array.from(integrated.entries()) };
  }, []);

  return (
    <Card title="@onegrid/dbsp — DBSP operator algebra (v0.0.10)">
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
        Differential dataflow operator algebra grounded in Budiu et al. VLDB
        2023. Z-sets carry insertion/retraction weights; <Mono>coalesce</Mono>{' '}
        collapses opposing weights and <Mono>integrate</Mono> applies a
        sequence of diffs to produce the materialized snapshot.
      </div>
      {result && (
        <Output>
{`coalesced (3 inserts after r1's retraction + reinsertion):
${JSON.stringify(result.coalesced, null, 2)}

integrated snapshot:
${JSON.stringify(result.integrated, null, 2)}`}
        </Output>
      )}
    </Card>
  );
}

function AiSection(): JSX.Element {
  const [nl, setNl] = useState('show rows where status is active and revenue > 1000');
  const promptPreview = useMemo(() => {
    if (typeof (ai as { buildPrompt?: unknown }).buildPrompt !== 'function') {
      return '(buildPrompt not in current build)';
    }
    try {
      const { buildPrompt } = ai as unknown as {
        buildPrompt: (input: { instruction: string; columns: Array<{ id: string }>; rows?: ReadonlyArray<unknown> }) => string;
      };
      return buildPrompt({
        instruction: nl,
        columns: [
          { id: 'id' },
          { id: 'name' },
          { id: 'status' },
          { id: 'revenue' },
        ],
      });
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, [nl]);

  return (
    <Card title="@onegrid/ai — natural language → grid intents (v0.0.11)">
      <input
        type="text"
        value={nl}
        onChange={(e) => setNl(e.target.value)}
        style={{
          width: '100%',
          background: 'var(--bg)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          padding: '4px 8px',
          borderRadius: 4,
          fontSize: 12,
          marginBottom: 8,
        }}
      />
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
        <Mono>buildPrompt</Mono> assembles the LLM input; the live
        interpretation step (<Mono>interpretIntent</Mono>) needs an
        adopter-supplied <Mono>LlmClient</Mono>, so the showcase only
        renders the prompt half.
      </div>
      <Output>{promptPreview}</Output>
    </Card>
  );
}

function McpSection(): JSX.Element {
  const exports = Object.keys(mcp).sort();
  return (
    <Card title="@onegrid/mcp — Model Context Protocol server (v0.0.11)">
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
        Exposes the grid as first-class MCP tools so LLMs can read cells /
        write cells / set sort/filter / commit formulas through a typed
        JSON-RPC contract.
      </div>
      <Output>exports: {exports.join(', ')}</Output>
    </Card>
  );
}

function SurfaceSection(): JSX.Element {
  return (
    <Card title="Other moat surfaces">
      <Output>
{`@onegrid/worker-plugins:  ${Object.keys(workerPlugins).sort().join(', ')}
@onegrid/data-worker:     ${Object.keys(dataWorker).sort().join(', ')}
@onegrid/orm-sync:        ${Object.keys(ormSync).sort().join(', ')}`}
      </Output>
    </Card>
  );
}
