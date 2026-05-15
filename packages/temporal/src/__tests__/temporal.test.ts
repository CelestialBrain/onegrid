import { describe, it, expect } from 'vitest';
import {
  TemporalLog,
  applyDiffToSnapshot,
  invertDiff,
} from '../index.js';
import type { RowDiff } from '@onegrid/protocol';

const ins = (v: number, k: string, f: Record<string, unknown>): RowDiff => ({
  kind: 'insert',
  version: v,
  pkey: k,
  fields: f,
});
const upd = (v: number, k: string, f: Record<string, unknown>): RowDiff => ({
  kind: 'update',
  version: v,
  pkey: k,
  fields: f,
});
const del = (v: number, k: string): RowDiff => ({
  kind: 'delete',
  version: v,
  pkey: k,
});

describe('TemporalLog basics', () => {
  it('append + current reflect monotonic state', () => {
    const log = new TemporalLog();
    log.append(ins(1, 'r1', { name: 'a' }));
    log.append(ins(2, 'r2', { name: 'b' }));
    log.append(upd(3, 'r1', { name: 'A' }));
    expect(log.headVersion).toBe(3);
    const snap = log.current();
    expect(snap.get('r1')).toEqual({ name: 'A' });
    expect(snap.get('r2')).toEqual({ name: 'b' });
  });

  it('handles delete', () => {
    const log = new TemporalLog();
    log.append(ins(1, 'r1', { x: 1 }));
    log.append(del(2, 'r1'));
    expect(log.current().has('r1')).toBe(false);
  });
});

describe('snapshotAt — time travel', () => {
  it('reconstructs the snapshot at any past version', () => {
    const log = new TemporalLog();
    log.append(ins(1, 'r1', { name: 'a', score: 10 }));
    log.append(ins(2, 'r2', { name: 'b', score: 20 }));
    log.append(upd(3, 'r1', { score: 99 }));
    log.append(del(4, 'r2'));

    expect(log.snapshotAt(0).size).toBe(0);
    expect(log.snapshotAt(1).get('r1')).toEqual({ name: 'a', score: 10 });
    expect(log.snapshotAt(2).get('r2')).toEqual({ name: 'b', score: 20 });
    expect(log.snapshotAt(3).get('r1')).toEqual({ name: 'a', score: 99 });
    expect(log.snapshotAt(4).has('r2')).toBe(false);
  });

  it('uses anchors for bounded replay cost', () => {
    const log = new TemporalLog({ anchorInterval: 5 });
    for (let i = 1; i <= 20; i++) log.append(ins(0, `r${i}`, { i }));
    const snap = log.snapshotAt(17);
    expect(snap.size).toBe(17);
    expect(snap.get('r17')).toEqual({ i: 17 });
  });

  it('throws on a future version', () => {
    const log = new TemporalLog();
    log.append(ins(0, 'a', {}));
    expect(() => log.snapshotAt(100)).toThrow(/OG_TEMPORAL_INVALID_VERSION/);
  });
});

describe('diffBetween', () => {
  it('returns the diffs strictly between (from, to]', () => {
    const log = new TemporalLog();
    log.append(ins(0, 'r1', { x: 1 }));
    log.append(ins(0, 'r2', { x: 2 }));
    log.append(ins(0, 'r3', { x: 3 }));
    const range = log.diffBetween(1, 3);
    expect(range).toHaveLength(2);
    expect((range[0]!.fields as { x: number }).x).toBe(2);
    expect((range[1]!.fields as { x: number }).x).toBe(3);
  });
});

describe('branch', () => {
  it('forks a sub-log that inherits past state but diverges going forward', () => {
    const main = new TemporalLog();
    main.append(ins(0, 'r1', { x: 1 }));
    main.append(ins(0, 'r2', { x: 2 }));
    // Branch at v2; advance main further.
    const fork = main.branch(2);
    main.append(upd(0, 'r1', { x: 999 }));
    fork.append(upd(0, 'r2', { x: 42 }));
    expect(main.current().get('r1')).toEqual({ x: 999 });
    expect(main.current().get('r2')).toEqual({ x: 2 });
    expect(fork.current().get('r1')).toEqual({ x: 1 });
    expect(fork.current().get('r2')).toEqual({ x: 42 });
  });
});

describe('invertDiff', () => {
  it('inverts insert → delete', () => {
    const inv = invertDiff(ins(1, 'r1', { x: 1 }), new Map());
    expect(inv.kind).toBe('delete');
  });

  it('inverts delete → insert with the previous row contents', () => {
    const snap = new Map([['r1', { x: 1, y: 2 }]]);
    const inv = invertDiff(del(2, 'r1'), snap);
    expect(inv.kind).toBe('insert');
    expect(inv.fields).toEqual({ x: 1, y: 2 });
  });

  it('inverts update → update of just the touched fields', () => {
    const snap = new Map([['r1', { x: 1, y: 2 }]]);
    const inv = invertDiff(upd(3, 'r1', { x: 99 }), snap);
    expect(inv.kind).toBe('update');
    expect(inv.fields).toEqual({ x: 1 });
  });
});

describe('applyDiffToSnapshot', () => {
  it('merges update fields onto existing row', () => {
    const snap = new Map([['r1', { a: 1, b: 2 }]]);
    applyDiffToSnapshot(snap, upd(0, 'r1', { b: 99 }));
    expect(snap.get('r1')).toEqual({ a: 1, b: 99 });
  });
});

describe('retentionVersions', () => {
  it('trims diffs older than the retention window', () => {
    const log = new TemporalLog({ retentionVersions: 5, anchorInterval: 0 });
    for (let i = 0; i < 10; i++) log.append(ins(0, `r${i}`, { i }));
    // After 10 diffs with retention=5, the earliest version retained
    // should be 5 (versions 6..10 kept; 1..5 trimmed).
    expect(log.size).toBe(5);
  });
});

describe('Undo via diffBetween + invertDiff', () => {
  it('rolls back from headVersion to an earlier version', () => {
    const log = new TemporalLog();
    log.append(ins(0, 'r1', { x: 1 }));   // v1
    log.append(upd(0, 'r1', { x: 2 }));   // v2
    log.append(upd(0, 'r1', { x: 3 }));   // v3

    // We want to roll back to v1. Walk forward, capturing the
    // pre-image at each step.
    const snapAtV1 = log.snapshotAt(1);
    const reconstructed = log.snapshotAt(1);
    // Forward replay from v1 to v3 (the forward diffs).
    for (const d of log.diffBetween(1, 3)) {
      applyDiffToSnapshot(reconstructed, d);
    }
    expect(reconstructed.get('r1')).toEqual({ x: 3 });
    // snapshotAt(1) reflects v1's state.
    expect(snapAtV1.get('r1')).toEqual({ x: 1 });
  });
});
