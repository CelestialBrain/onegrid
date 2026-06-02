// =============================================================================
// Framework adapters — the same grid shape rendered through @onegrid/react,
// and the other adapters' surfaces exercised at the import level (they
// don't share React's render tree so we can't co-mount them; we show that
// they expose the same shape-key recreate gate + imperative-update +
// callback late-bind pattern documented in the ROADMAP §1).
// =============================================================================

import { useState, type JSX } from 'react';
import { OneGrid } from '@onegrid/react';
import type { ColumnDef, RowSource } from '@onegrid/core';
import * as headless from '@onegrid/headless';
import * as reactPkg from '@onegrid/react';
import * as vue from '@onegrid/vue';
import * as svelte from '@onegrid/svelte';
import * as solid from '@onegrid/solid';
import * as angular from '@onegrid/angular';
import * as wc from '@onegrid/wc';
import { Card, GridHost, Mono, Output } from '../ui';

const COLUMNS: ReadonlyArray<ColumnDef> = [
  { id: 'id', width: 60 },
  { id: 'name', width: 140 },
  { id: 'value', width: 100 },
];

const SOURCE: RowSource = {
  numRows: 50,
  getCell(rowIndex, columnId) {
    if (columnId === 'id') return rowIndex + 1;
    if (columnId === 'name') return `item-${rowIndex + 1}`;
    if (columnId === 'value') return Math.floor((rowIndex + 1) * 13.7) % 1000;
    return null;
  },
};

const ADAPTERS = [
  { name: '@onegrid/react', module: reactPkg, kind: 'live' as const },
  { name: '@onegrid/headless', module: headless, kind: 'surface' as const },
  { name: '@onegrid/vue', module: vue, kind: 'surface' as const },
  { name: '@onegrid/svelte', module: svelte, kind: 'surface' as const },
  { name: '@onegrid/solid', module: solid, kind: 'surface' as const },
  { name: '@onegrid/angular', module: angular, kind: 'surface' as const },
  { name: '@onegrid/wc', module: wc, kind: 'surface' as const },
];

export function FrameworkAdaptersTab(): JSX.Element {
  const [selected, setSelected] = useState(0);
  const adapter = ADAPTERS[selected]!;
  const exports = Object.keys(adapter.module).sort();

  return (
    <div>
      <Card title="React mount (live)">
        <GridHost>
          <OneGrid columns={COLUMNS} rowSource={SOURCE} rowHeight={28} enableColumnResize enableColumnReorder />
        </GridHost>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
          Rendered through <Mono>@onegrid/react</Mono>'s <Mono>{`<OneGrid>`}</Mono>{' '}
          component. The other adapters share the same shape-key recreate
          gate + imperative-update + callback late-bind pattern but mount
          inside their respective framework render trees.
        </div>
      </Card>

      <Card title="Adapter surface inspection">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {ADAPTERS.map((a, i) => (
            <button
              key={a.name}
              onClick={() => setSelected(i)}
              style={{
                background: i === selected ? 'var(--accent)' : 'var(--panel)',
                color: i === selected ? '#fff' : 'var(--text)',
                border: '1px solid var(--border)',
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {a.name.replace('@onegrid/', '')}
              {a.kind === 'live' && (
                <span style={{ marginLeft: 4, color: a.kind === 'live' ? '#3fb950' : undefined }}>
                  •
                </span>
              )}
            </button>
          ))}
        </div>
        <Output>{`exports (${exports.length}):\n  ${exports.join('\n  ')}`}</Output>
      </Card>

      <Card title="ROADMAP §1 reference">
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          From the ROADMAP: "Multi-framework adapters (React/Vue/Svelte/
          Solid/Angular/WC) — All six are real implementations sharing
          the React-discovered shape-key recreate gate + imperative-
          update fan-out + callback late-bind pattern. Vue/Solid/Svelte/
          Angular/WC stay <Mono>@beta</Mono> per surface policy until a
          minor of stability."
        </div>
      </Card>
    </div>
  );
}
