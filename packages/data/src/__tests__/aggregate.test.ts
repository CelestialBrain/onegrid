import { describe, expect, it } from 'vitest';
import { createColumnTable, type ColumnInput } from '../column-table';
import { aggregate, registerAggregator } from '../aggregate';

const numCol: ColumnInput = {
  schema: { id: 'x', type: 'int32', nullable: true },
  data: [10, 20, null, 30, 40, null],
};

const strCol: ColumnInput = {
  schema: { id: 'tag', type: 'utf8' },
  data: ['a', 'b', 'a', 'c', 'a', 'b'],
};

describe('aggregate', () => {
  it('sums numeric columns ignoring nulls', () => {
    const t = createColumnTable([numCol]);
    expect(aggregate(t, { columnId: 'x', fn: 'sum' })).toBe(100);
  });

  it('avgs numeric columns ignoring nulls', () => {
    const t = createColumnTable([numCol]);
    expect(aggregate(t, { columnId: 'x', fn: 'avg' })).toBe(25);
  });

  it('count returns non-null count', () => {
    const t = createColumnTable([numCol]);
    expect(aggregate(t, { columnId: 'x', fn: 'count' })).toBe(4);
  });

  it('countDistinct returns unique non-null values', () => {
    const t = createColumnTable([strCol]);
    expect(aggregate(t, { columnId: 'tag', fn: 'countDistinct' })).toBe(3);
  });

  it('min / max work for strings and numbers', () => {
    const t = createColumnTable([numCol, strCol]);
    expect(aggregate(t, { columnId: 'x', fn: 'min' })).toBe(10);
    expect(aggregate(t, { columnId: 'x', fn: 'max' })).toBe(40);
    expect(aggregate(t, { columnId: 'tag', fn: 'min' })).toBe('a');
    expect(aggregate(t, { columnId: 'tag', fn: 'max' })).toBe('c');
  });

  it('first/last skip nulls', () => {
    const t = createColumnTable([numCol]);
    expect(aggregate(t, { columnId: 'x', fn: 'first' })).toBe(10);
    expect(aggregate(t, { columnId: 'x', fn: 'last' })).toBe(40);
  });

  it('honors a row-index iterable', () => {
    const t = createColumnTable([numCol]);
    expect(aggregate(t, { columnId: 'x', fn: 'sum' }, [0, 3])).toBe(40);
  });

  it('returns null when column is unknown', () => {
    const t = createColumnTable([numCol]);
    expect(aggregate(t, { columnId: 'missing', fn: 'sum' })).toBeNull();
  });

  it('supports custom aggregators via registerAggregator', () => {
    registerAggregator('range', () => (column, rowIndices) => {
      let lo = Infinity;
      let hi = -Infinity;
      const indices = rowIndices ?? rangeIndices(column.length);
      for (const i of indices) {
        if (column.isNull(i)) continue;
        const v = Number(column.get(i));
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (lo === Infinity) return null;
      return hi - lo;
    });
    const t = createColumnTable([numCol]);
    expect(aggregate(t, { columnId: 'x', fn: 'range' })).toBe(30);
  });

  it('rejects re-registering a built-in name', () => {
    expect(() =>
      registerAggregator('sum', () => () => 0),
    ).toThrow();
  });
});

function* rangeIndices(n: number): Generator<number> {
  for (let i = 0; i < n; i++) yield i;
}
