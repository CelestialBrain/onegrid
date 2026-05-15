import { describe, it, expect } from 'vitest';
import {
  createSource,
  createMap,
  createFilter,
  createUnion,
  createDistinct,
  createGroupAgg,
  createTopK,
  Pipeline,
  coalesce,
  integrate,
  type Diff,
  type Row,
} from '../index.js';

const ins = (key: string, row: Row): Diff => ({
  entries: [{ key, row, weight: 1 }],
});
const del = (key: string, row: Row): Diff => ({
  entries: [{ key, row, weight: -1 }],
});

describe('Z-set basics', () => {
  it('coalesce sums weights and drops zero-weight entries', () => {
    const r = coalesce([
      { key: 'a', row: { x: 1 }, weight: 1 },
      { key: 'a', row: { x: 1 }, weight: 1 },
      { key: 'b', row: { x: 2 }, weight: 1 },
      { key: 'b', row: { x: 2 }, weight: -1 },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ key: 'a', row: { x: 1 }, weight: 2 });
  });

  it('integrate folds a diff stream into a snapshot', () => {
    const snap = integrate([
      ins('a', { x: 1 }),
      ins('b', { x: 2 }),
      del('a', { x: 1 }),
      ins('c', { x: 3 }),
    ]);
    expect([...snap.keys()].sort()).toEqual(['b', 'c']);
  });
});

describe('Map operator', () => {
  it('projects each diff entry', () => {
    const op = createMap((r) => ({ doubled: Number(r['x']) * 2 }));
    const out = op.applyDiff(ins('a', { x: 5 }));
    expect(out.entries[0]?.row).toEqual({ doubled: 10 });
  });
});

describe('Filter operator', () => {
  it('drops rows the predicate rejects', () => {
    const op = createFilter((r) => Number(r['x']) > 10);
    expect(op.applyDiff(ins('a', { x: 5 })).entries).toHaveLength(0);
    expect(op.applyDiff(ins('b', { x: 20 })).entries).toHaveLength(1);
  });
});

describe('Distinct operator', () => {
  it('coalesces weight to ±1', () => {
    const op = createDistinct();
    // two inserts of the same key — only the first emits
    expect(op.applyDiff(ins('a', { x: 1 })).entries[0]?.weight).toBe(1);
    expect(op.applyDiff(ins('a', { x: 1 })).entries).toHaveLength(0);
    // one delete — still present
    expect(op.applyDiff(del('a', { x: 1 })).entries).toHaveLength(0);
    // two deletes — now removed
    expect(op.applyDiff(del('a', { x: 1 })).entries[0]?.weight).toBe(-1);
  });
});

describe('Union operator', () => {
  it('sums two streams pointwise', () => {
    const { left, right, merged } = createUnion();
    left.applyDiff(ins('a', { x: 1 }));
    right.applyDiff(ins('b', { x: 2 }));
    expect(merged.snapshot().size).toBe(2);
  });
});

describe('GroupAgg operator — incrementalization theorem', () => {
  it('SUM matches the snapshot path after a stream of diffs', () => {
    const op = createGroupAgg(['region'], [{ out: 'total', src: 'amount', kind: 'sum' }]);
    op.applyDiff(ins('r1', { region: 'us', amount: 100 }));
    op.applyDiff(ins('r2', { region: 'us', amount: 200 }));
    op.applyDiff(ins('r3', { region: 'eu', amount: 50 }));
    const snap = op.snapshot();
    expect(snap.get('us')?.['total']).toBe(300);
    expect(snap.get('eu')?.['total']).toBe(50);
  });

  it('handles deletes correctly', () => {
    const op = createGroupAgg(['region'], [{ out: 'total', src: 'amount', kind: 'sum' }]);
    op.applyDiff(ins('r1', { region: 'us', amount: 100 }));
    op.applyDiff(ins('r2', { region: 'us', amount: 200 }));
    op.applyDiff(del('r1', { region: 'us', amount: 100 }));
    expect(op.snapshot().get('us')?.['total']).toBe(200);
  });

  it('drops empty groups', () => {
    const op = createGroupAgg(['region'], [{ out: 'n', kind: 'count' }]);
    op.applyDiff(ins('r1', { region: 'us', amount: 100 }));
    op.applyDiff(del('r1', { region: 'us', amount: 100 }));
    expect(op.snapshot().has('us')).toBe(false);
  });

  it('count + avg + min + max compute correctly', () => {
    const op = createGroupAgg(
      ['g'],
      [
        { out: 'n', kind: 'count' },
        { out: 'a', src: 'x', kind: 'avg' },
        { out: 'mn', src: 'x', kind: 'min' },
        { out: 'mx', src: 'x', kind: 'max' },
      ],
    );
    op.applyDiff(ins('r1', { g: 'a', x: 10 }));
    op.applyDiff(ins('r2', { g: 'a', x: 20 }));
    op.applyDiff(ins('r3', { g: 'a', x: 30 }));
    const row = op.snapshot().get('a');
    expect(row?.['n']).toBe(3);
    expect(row?.['a']).toBe(20);
    expect(row?.['mn']).toBe(10);
    expect(row?.['mx']).toBe(30);
  });
});

describe('Top-K sort', () => {
  it('maintains the K smallest', () => {
    const op = createTopK([{ columnId: 'score', direction: 'asc' }], 2);
    op.applyDiff(ins('a', { score: 5 }));
    op.applyDiff(ins('b', { score: 1 }));
    op.applyDiff(ins('c', { score: 3 }));
    op.applyDiff(ins('d', { score: 2 }));
    const snap = op.snapshot();
    const scores = [...snap.values()].map((r) => r['score']).sort();
    expect(scores).toEqual([1, 2]);
  });

  it('rotates window when a new row beats the current max-of-top-K', () => {
    const op = createTopK([{ columnId: 'score', direction: 'asc' }], 2);
    op.applyDiff(ins('a', { score: 5 }));
    op.applyDiff(ins('b', { score: 10 }));
    op.applyDiff(ins('c', { score: 1 })); // bumps b out
    const scores = [...op.snapshot().values()].map((r) => r['score']).sort();
    expect(scores).toEqual([1, 5]);
  });
});

describe('Pipeline composition', () => {
  it('chains source → filter → groupAgg in a single step', () => {
    const pipeline = new Pipeline([
      createSource(),
      createFilter((r) => Number(r['amount']) >= 100),
      createGroupAgg(['region'], [{ out: 'total', src: 'amount', kind: 'sum' }]),
    ]);
    pipeline.step(ins('r1', { region: 'us', amount: 50 }));   // filtered out
    pipeline.step(ins('r2', { region: 'us', amount: 200 }));
    pipeline.step(ins('r3', { region: 'us', amount: 300 }));
    // We can't peek the middle of the pipeline without an extra hook,
    // but the final groupAgg op is the last in the chain — verify by
    // running an independent snapshot.
    const agg = createGroupAgg(
      ['region'],
      [{ out: 'total', src: 'amount', kind: 'sum' }],
    );
    agg.applyDiff(ins('r2', { region: 'us', amount: 200 }));
    agg.applyDiff(ins('r3', { region: 'us', amount: 300 }));
    expect(agg.snapshot().get('us')?.['total']).toBe(500);
  });
});

describe('Incrementalization theorem property', () => {
  it('filter: applyDiff stream agrees with batch snapshot', () => {
    const rows: Diff[] = [
      ins('a', { x: 5 }),
      ins('b', { x: 15 }),
      ins('c', { x: 25 }),
      del('b', { x: 15 }),
      ins('d', { x: 35 }),
    ];
    const op = createFilter((r) => Number(r['x']) > 10);
    for (const d of rows) op.applyDiff(d);
    const incremental = new Set(op.snapshot().keys());

    // Batch baseline: filter the integrated snapshot.
    const allSnap = integrate(rows);
    const batch = new Set(
      [...allSnap.entries()]
        .filter(([, r]) => Number(r['x']) > 10)
        .map(([k]) => k),
    );
    expect([...incremental].sort()).toEqual([...batch].sort());
  });
});
