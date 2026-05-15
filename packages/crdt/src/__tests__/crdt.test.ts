import { describe, it, expect, vi } from 'vitest';
import {
  bindYjsRows,
  bindAutomergeRows,
  applyLocalToYjs,
  type YMapLike,
  type YMapEventLike,
} from '../index.js';
import type { RowDiff } from '@onegrid/protocol';

// -----------------------------------------------------------------------------
// Yjs harness — in-process fake Y.Map that fires observe handlers
// -----------------------------------------------------------------------------

function makeFakeYMap(): {
  map: YMapLike;
  fire: (changes: ReadonlyMap<string, { action: 'add' | 'update' | 'delete' }>) => void;
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

describe('bindYjsRows', () => {
  it('translates an add into an insert diff', () => {
    const { map } = makeFakeYMap();
    const diffs: RowDiff[] = [];
    bindYjsRows({ map, onDiff: (d) => diffs.push(d) });
    map.set('r1', { name: 'alpha' });
    expect(diffs).toEqual([
      { kind: 'insert', version: 1, pkey: 'r1', fields: { name: 'alpha' } },
    ]);
  });

  it('translates an update into an update diff', () => {
    const { map } = makeFakeYMap();
    map.set('r1', { name: 'alpha' });
    const diffs: RowDiff[] = [];
    bindYjsRows({ map, onDiff: (d) => diffs.push(d) });
    map.set('r1', { name: 'beta' });
    expect(diffs[0]?.kind).toBe('update');
  });

  it('translates a delete into a delete diff', () => {
    const { map } = makeFakeYMap();
    map.set('r1', { name: 'alpha' });
    const diffs: RowDiff[] = [];
    bindYjsRows({ map, onDiff: (d) => diffs.push(d) });
    map.delete('r1');
    expect(diffs[0]).toEqual({ kind: 'delete', version: 1, pkey: 'r1' });
  });

  it('close unsubscribes the observer', () => {
    const { map } = makeFakeYMap();
    const diffs: RowDiff[] = [];
    const handle = bindYjsRows({ map, onDiff: (d) => diffs.push(d) });
    handle.close();
    map.set('r1', {});
    expect(diffs).toHaveLength(0);
  });

  it('routes onDiff throws into onError', () => {
    const { map } = makeFakeYMap();
    const onError = vi.fn();
    bindYjsRows({
      map,
      onDiff: () => {
        throw new Error('downstream failure');
      },
      onError,
    });
    map.set('r1', {});
    expect(onError).toHaveBeenCalled();
  });
});

describe('applyLocalToYjs', () => {
  it('insert calls map.set with fields', () => {
    const { map } = makeFakeYMap();
    applyLocalToYjs(map, { kind: 'insert', pkey: 'r1', fields: { x: 1 } });
    expect(map.get('r1')).toEqual({ x: 1 });
  });
  it('delete calls map.delete', () => {
    const { map } = makeFakeYMap();
    map.set('r1', { x: 1 });
    applyLocalToYjs(map, { kind: 'delete', pkey: 'r1' });
    expect(map.get('r1')).toBeUndefined();
  });
});

// -----------------------------------------------------------------------------
// Automerge harness — heads-diff style watcher
// -----------------------------------------------------------------------------

describe('bindAutomergeRows', () => {
  it('detects inserts, updates, deletes between snapshot calls', () => {
    let state: Record<string, { x: number }> = { r1: { x: 1 } };
    let trigger = (): void => {};
    const diffs: RowDiff[] = [];
    bindAutomergeRows({
      doc: { getRows: () => state },
      watcher: {
        subscribe: (h) => {
          trigger = h;
          return () => {
            trigger = (): void => {};
          };
        },
      },
      onDiff: (d) => diffs.push(d),
    });
    // insert
    state = { r1: { x: 1 }, r2: { x: 2 } };
    trigger();
    // update
    state = { r1: { x: 99 }, r2: { x: 2 } };
    trigger();
    // delete
    state = { r1: { x: 99 } };
    trigger();
    expect(diffs.map((d) => d.kind)).toEqual(['insert', 'update', 'delete']);
    expect(diffs[0]?.pkey).toBe('r2');
    expect(diffs[1]?.pkey).toBe('r1');
    expect(diffs[2]?.pkey).toBe('r2');
  });
});
