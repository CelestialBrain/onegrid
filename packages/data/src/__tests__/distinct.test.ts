import { describe, expect, it } from 'vitest';
import { createColumnTable, type ColumnInput } from '../column-table';
import { enumerateDistinct, enumerateDistinctChunked } from '../distinct';

const statusCol: ColumnInput = {
  schema: { id: 'status', type: 'utf8' },
  data: ['a', 'b', 'a', 'c', 'b', 'a', 'a'], // a=4, b=2, c=1
};

const numCol: ColumnInput = {
  schema: { id: 'n', type: 'int32' },
  data: new Int32Array([1, 2, 1, 3, 2, 1, 1]),
};

describe('enumerateDistinct', () => {
  it('counts each distinct value', () => {
    const t = createColumnTable([statusCol]);
    const out = enumerateDistinct(t, 'status');
    expect(out).toEqual([
      { value: 'a', count: 4 },
      { value: 'b', count: 2 },
      { value: 'c', count: 1 },
    ]);
  });

  it('sorts by count descending, then by value ascending', () => {
    const t = createColumnTable([numCol]);
    const out = enumerateDistinct(t, 'n');
    expect(out.map((d) => d.value)).toEqual([1, 2, 3]);
    expect(out.map((d) => d.count)).toEqual([4, 2, 1]);
  });

  it('respects limit', () => {
    const t = createColumnTable([statusCol]);
    const out = enumerateDistinct(t, 'status', { limit: 2 });
    expect(out).toHaveLength(2);
  });

  it('respects rowFilter (only counts rows that pass)', () => {
    const t = createColumnTable([statusCol]);
    const out = enumerateDistinct(t, 'status', {
      rowFilter: (i) => i < 4, // first 4: a, b, a, c
    });
    const map = Object.fromEntries(out.map((d) => [String(d.value), d.count]));
    expect(map).toEqual({ a: 2, b: 1, c: 1 });
  });

  it('buckets nulls under value === null', () => {
    const sparseCol: ColumnInput = {
      schema: { id: 's', type: 'utf8' },
      data: ['x', null, 'x', null, null] as ReadonlyArray<unknown>,
    };
    const t = createColumnTable([sparseCol]);
    const out = enumerateDistinct(t, 's');
    expect(out).toEqual([
      { value: null, count: 3 },
      { value: 'x', count: 2 },
    ]);
  });
});

describe('enumerateDistinctChunked', () => {
  it('produces the same result as the synchronous variant', async () => {
    const t = createColumnTable([statusCol]);
    const sync = enumerateDistinct(t, 'status');
    const chunked = await enumerateDistinctChunked(t, 'status', { batchSize: 2 });
    expect(chunked).toEqual(sync);
  });

  it('calls onProgress at least once per batch', async () => {
    const t = createColumnTable([statusCol]);
    const calls: number[] = [];
    await enumerateDistinctChunked(t, 'status', {
      batchSize: 2,
      onProgress: (_partial, scanned) => calls.push(scanned),
    });
    expect(calls.length).toBeGreaterThanOrEqual(3); // 7 rows / 2 per batch
    expect(calls[calls.length - 1]).toBe(7);
  });
});
