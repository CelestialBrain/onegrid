// =============================================================================
// CRDT collab — two Yjs documents synced in-process via syncProtocol.
// =============================================================================

import { useEffect, useRef, useState, type JSX } from 'react';
import * as Y from 'yjs';
import * as crdt from '@onegrid/crdt';
import { Btn, Card, Mono, Output } from '../ui';

interface PaneState {
  readonly doc: Y.Doc;
  readonly rows: Y.Map<Y.Map<unknown>>;
}

function makePane(): PaneState {
  const doc = new Y.Doc();
  const rows = doc.getMap<Y.Map<unknown>>('rows');
  // Seed with three rows.
  ['r1', 'r2', 'r3'].forEach((id, i) => {
    const row = new Y.Map<unknown>();
    row.set('id', id);
    row.set('name', `Row ${i + 1}`);
    row.set('value', (i + 1) * 100);
    rows.set(id, row);
  });
  return { doc, rows };
}

function syncDocs(a: Y.Doc, b: Y.Doc) {
  // In-process bidirectional sync via Yjs update events.
  a.on('update', (update: Uint8Array) => Y.applyUpdate(b, update));
  b.on('update', (update: Uint8Array) => Y.applyUpdate(a, update));
}

export function CrdtTab(): JSX.Element {
  const [paneA] = useState(makePane);
  const [paneB] = useState(makePane);
  const [renderTick, setRenderTick] = useState(0);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    // Initial state-vector exchange so both panes match before we wire
    // the update bridge.
    Y.applyUpdate(paneB.doc, Y.encodeStateAsUpdate(paneA.doc));
    Y.applyUpdate(paneA.doc, Y.encodeStateAsUpdate(paneB.doc));
    syncDocs(paneA.doc, paneB.doc);
    const onUpdate = () => setRenderTick((t) => t + 1);
    paneA.doc.on('update', onUpdate);
    paneB.doc.on('update', onUpdate);
  }, [paneA, paneB]);

  void renderTick;

  function setCell(pane: PaneState, rowId: string, field: string, value: unknown) {
    pane.doc.transact(() => {
      const row = pane.rows.get(rowId);
      if (row) row.set(field, value);
    });
  }

  function dumpPane(pane: PaneState): string {
    const lines: string[] = [];
    pane.rows.forEach((row, id) => {
      const fields = Array.from(row.entries())
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join('  ');
      lines.push(`${id}  ${fields}`);
    });
    return lines.join('\n');
  }

  function PaneView({ pane, label }: { pane: PaneState; label: string }) {
    return (
      <Card title={label}>
        <Output>{dumpPane(pane)}</Output>
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <Btn
            onClick={() => setCell(pane, 'r1', 'value', Math.floor(Math.random() * 1000))}
          >
            r1.value = random
          </Btn>
          <Btn onClick={() => setCell(pane, 'r2', 'name', `Edited@${Date.now().toString().slice(-4)}`)}>
            r2.name = edit
          </Btn>
          <Btn
            onClick={() => {
              const row = new Y.Map<unknown>();
              row.set('id', `r${Math.floor(Math.random() * 9000) + 1000}`);
              row.set('name', 'new row');
              row.set('value', 0);
              pane.doc.transact(() => {
                pane.rows.set(row.get('id') as string, row);
              });
            }}
          >
            insert row
          </Btn>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <Card title="Setup">
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Two <Mono>Y.Doc</Mono>s in this tab. Their update events are
          piped both ways via{' '}
          <Mono>doc.on('update', ...) → Y.applyUpdate(other, ...)</Mono>.
          Real adopters wire a transport (<Mono>y-websocket</Mono>,{' '}
          <Mono>y-webrtc</Mono>, <Mono>@hocuspocus/provider</Mono>) in
          place of this in-process bridge. The wave-22{' '}
          <Mono>@onegrid/crdt</Mono> field-granularity binding (commit{' '}
          <Mono>ace7507</Mono>) is the structural piece both peers consume.
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <PaneView pane={paneA} label="Peer A" />
        <PaneView pane={paneB} label="Peer B" />
      </div>
      <Card title="crdt package exports">
        <Output>{Object.keys(crdt).sort().join(', ')}</Output>
      </Card>
    </div>
  );
}
