// =============================================================================
// @onegrid/crdt — v1.1.0 Chunk C:
//   - field-granularity Y.Map rows (opt-in; default 'row' preserves v1.0.0
//     wire-shape back-compat),
//   - Awareness presence bridge.
// =============================================================================

import { describe, expect, it, vi } from 'vitest';
import {
  bindYjsRows,
  bindYjsPresence,
  setLocalPresence,
  clearLocalPresence,
  type YMapLike,
  type YMapEventLike,
  type AwarenessLike,
  type AwarenessChangesLike,
} from '../index.js';
import type { RowDiff } from '@onegrid/protocol';

// -----------------------------------------------------------------------------
// Nested YMap fake: rows are themselves YMap fakes.
// -----------------------------------------------------------------------------

function makeChildMap(initial?: Record<string, unknown>): YMapLike {
  const data = new Map<string, unknown>(initial ? Object.entries(initial) : []);
  const handlers = new Set<(e: YMapEventLike) => void>();
  return {
    get: (k) => data.get(k),
    set: (k, v) => {
      const action: 'add' | 'update' = data.has(k) ? 'update' : 'add';
      data.set(k, v);
      const keys = new Map([[k, { action }]]);
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
}

function makeRowMap(): YMapLike {
  // Same shape — children also use makeChildMap and the parent stores them.
  return makeChildMap();
}

describe('bindYjsRows — field granularity', () => {
  it("default 'row' granularity sends the whole row as fields", () => {
    const root = makeRowMap();
    const diffs: RowDiff[] = [];
    bindYjsRows({ map: root, onDiff: (d) => diffs.push(d) });
    root.set('r1', { name: 'alpha', age: 30 });
    expect(diffs[0]).toEqual({
      kind: 'insert',
      version: 1,
      pkey: 'r1',
      fields: { name: 'alpha', age: 30 },
    });
  });

  it("'field' granularity emits update with only the changed field", () => {
    const root = makeRowMap();
    const row = makeChildMap({ name: 'alpha', age: 30 });
    const diffs: RowDiff[] = [];
    bindYjsRows({ map: root, onDiff: (d) => diffs.push(d), granularity: 'field' });
    // Insert the nested row — first diff covers the insert.
    root.set('r1', row);
    // Now mutate one field; should emit a single update with just { age: 31 }.
    row.set('age', 31);
    const update = diffs.find((d) => d.kind === 'update');
    expect(update).toBeDefined();
    expect(update?.fields).toEqual({ age: 31 });
    expect(update?.fields).not.toHaveProperty('name');
  });

  it("'field' granularity: deleting a nested field reports undefined", () => {
    const root = makeRowMap();
    const row = makeChildMap({ name: 'alpha', age: 30 });
    root.set('r1', row);
    const diffs: RowDiff[] = [];
    bindYjsRows({ map: root, onDiff: (d) => diffs.push(d), granularity: 'field' });
    row.delete('age');
    expect(diffs[0]?.kind).toBe('update');
    expect(diffs[0]?.fields).toEqual({ age: undefined });
  });

  it("'field' granularity: close stops both root and nested observers", () => {
    const root = makeRowMap();
    const row = makeChildMap({ name: 'alpha' });
    root.set('r1', row);
    const diffs: RowDiff[] = [];
    const h = bindYjsRows({ map: root, onDiff: (d) => diffs.push(d), granularity: 'field' });
    h.close();
    row.set('name', 'beta');
    root.set('r2', makeChildMap({ name: 'gamma' }));
    expect(diffs).toHaveLength(0);
  });

  it("'field' granularity: deleting a row stops emitting updates from its old nested map", () => {
    const root = makeRowMap();
    const row = makeChildMap({ name: 'alpha' });
    root.set('r1', row);
    const diffs: RowDiff[] = [];
    bindYjsRows({ map: root, onDiff: (d) => diffs.push(d), granularity: 'field' });
    root.delete('r1');
    diffs.length = 0;
    row.set('name', 'orphan');
    expect(diffs).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// Awareness fake
// -----------------------------------------------------------------------------

function makeFakeAwareness(localId: number): {
  awareness: AwarenessLike;
  setPeer: (id: number, state: Record<string, unknown>) => void;
  removePeer: (id: number) => void;
} {
  const states = new Map<number, Record<string, unknown>>();
  states.set(localId, {});
  const listeners = new Set<(c: AwarenessChangesLike, origin: unknown) => void>();
  const emit = (changes: AwarenessChangesLike): void => {
    listeners.forEach((l) => l(changes, null));
  };
  const awareness: AwarenessLike = {
    clientID: localId,
    getStates: () => states,
    getLocalState: () => states.get(localId) ?? null,
    setLocalState: (s) => {
      if (s === null) {
        states.delete(localId);
        emit({ added: [], updated: [], removed: [localId] });
      } else {
        states.set(localId, s);
        emit({ added: [], updated: [localId], removed: [] });
      }
    },
    setLocalStateField: (field, value) => {
      const cur = states.get(localId) ?? {};
      states.set(localId, { ...cur, [field]: value });
      emit({ added: [], updated: [localId], removed: [] });
    },
    on: (_event, h) => {
      listeners.add(h);
    },
    off: (_event, h) => {
      listeners.delete(h);
    },
  };
  return {
    awareness,
    setPeer: (id, state) => {
      const exists = states.has(id);
      states.set(id, state);
      emit({ added: exists ? [] : [id], updated: exists ? [id] : [], removed: [] });
    },
    removePeer: (id) => {
      states.delete(id);
      emit({ added: [], updated: [], removed: [id] });
    },
  };
}

describe('bindYjsPresence', () => {
  it('emits an initial snapshot including the local peer', () => {
    const { awareness } = makeFakeAwareness(7);
    const snapshots: unknown[][] = [];
    bindYjsPresence({ awareness, onPeers: (p) => snapshots.push([...p]) });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toEqual([{ clientID: 7, state: {}, isSelf: true }]);
  });

  it('tracks peer join / update / leave', () => {
    const { awareness, setPeer, removePeer } = makeFakeAwareness(7);
    const snapshots: { clientID: number; state: unknown; isSelf: boolean }[][] = [];
    bindYjsPresence({ awareness, onPeers: (p) => snapshots.push([...p]) });
    setPeer(11, { cursor: { row: 1, col: 2 } });
    setPeer(11, { cursor: { row: 3, col: 4 } });
    removePeer(11);
    // initial + 3 changes = 4 snapshots
    expect(snapshots).toHaveLength(4);
    expect(snapshots[1]!.find((p) => p.clientID === 11)?.state).toEqual({
      cursor: { row: 1, col: 2 },
    });
    expect(snapshots[2]!.find((p) => p.clientID === 11)?.state).toEqual({
      cursor: { row: 3, col: 4 },
    });
    expect(snapshots[3]!.find((p) => p.clientID === 11)).toBeUndefined();
  });

  it('close unsubscribes', () => {
    const { awareness, setPeer } = makeFakeAwareness(7);
    const onPeers = vi.fn();
    const h = bindYjsPresence({ awareness, onPeers });
    h.close();
    setPeer(11, { x: 1 });
    expect(onPeers).toHaveBeenCalledTimes(1); // initial only
  });

  it('routes onPeers throws into onError', () => {
    const { awareness, setPeer } = makeFakeAwareness(7);
    const onError = vi.fn();
    bindYjsPresence({
      awareness,
      onPeers: () => {
        throw new Error('downstream');
      },
      onError,
    });
    setPeer(11, {});
    expect(onError).toHaveBeenCalled();
  });
});

describe('setLocalPresence / clearLocalPresence', () => {
  it('setLocalPresence delegates to setLocalStateField', () => {
    const { awareness } = makeFakeAwareness(7);
    setLocalPresence(awareness, 'cursor', { row: 1, col: 2 });
    expect(awareness.getLocalState()).toEqual({ cursor: { row: 1, col: 2 } });
  });

  it('clearLocalPresence sets the state to null', () => {
    const { awareness } = makeFakeAwareness(7);
    setLocalPresence(awareness, 'cursor', { row: 1, col: 2 });
    clearLocalPresence(awareness);
    expect(awareness.getLocalState()).toBeNull();
  });
});
