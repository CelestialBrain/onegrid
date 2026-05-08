import { describe, expect, it } from 'vitest';
import { fingerprintQuery } from '../fingerprint';
import type { FilterModel, SortModel } from '@onegrid/protocol';

describe('fingerprintQuery', () => {
  it('produces equal fingerprints for equal inputs', () => {
    const sort: SortModel = [{ columnId: 'a', direction: 'asc' }];
    const filter: FilterModel = null;
    expect(fingerprintQuery(sort, filter)).toBe(fingerprintQuery(sort, filter));
  });

  it('differentiates sort direction', () => {
    const asc = fingerprintQuery([{ columnId: 'a', direction: 'asc' }], null);
    const desc = fingerprintQuery([{ columnId: 'a', direction: 'desc' }], null);
    expect(asc).not.toBe(desc);
  });

  it('differentiates sort priority order', () => {
    const ab = fingerprintQuery(
      [
        { columnId: 'a', direction: 'asc' },
        { columnId: 'b', direction: 'asc' },
      ],
      null,
    );
    const ba = fingerprintQuery(
      [
        { columnId: 'b', direction: 'asc' },
        { columnId: 'a', direction: 'asc' },
      ],
      null,
    );
    expect(ab).not.toBe(ba);
  });

  it('treats unspecified nulls handling as "last"', () => {
    const explicit = fingerprintQuery(
      [{ columnId: 'a', direction: 'asc', nulls: 'last' }],
      null,
    );
    const implicit = fingerprintQuery([{ columnId: 'a', direction: 'asc' }], null);
    expect(explicit).toBe(implicit);
  });

  it('differentiates filter values', () => {
    const f1: FilterModel = {
      type: 'comparison',
      columnId: 'price',
      op: 'gt',
      value: 100,
    };
    const f2: FilterModel = {
      type: 'comparison',
      columnId: 'price',
      op: 'gt',
      value: 200,
    };
    expect(fingerprintQuery([], f1)).not.toBe(fingerprintQuery([], f2));
  });

  it('canonicalizes nested logical filters', () => {
    const f: FilterModel = {
      type: 'logical',
      op: 'and',
      filters: [
        { type: 'comparison', columnId: 'a', op: 'eq', value: 1 },
        { type: 'comparison', columnId: 'b', op: 'eq', value: 2 },
      ],
    };
    expect(fingerprintQuery([], f)).toBe(fingerprintQuery([], f));
  });

  it('differentiates grouping vs no grouping', () => {
    const grouped = fingerprintQuery([], null, { columns: ['region'], openKeys: [] });
    const ungrouped = fingerprintQuery([], null);
    expect(grouped).not.toBe(ungrouped);
  });

  it('differentiates aggregations vs no aggregations', () => {
    const grouping = { columns: ['status'], openKeys: [] };
    const noAgg = fingerprintQuery([], null, grouping);
    const withAgg = fingerprintQuery([], null, grouping, undefined, undefined, [
      { columnId: 'revenue', fn: 'sum' },
    ]);
    expect(noAgg).not.toBe(withAgg);
  });

  it('differentiates sum vs avg of the same column', () => {
    const grouping = { columns: ['status'], openKeys: [] };
    const sum = fingerprintQuery([], null, grouping, undefined, undefined, [
      { columnId: 'revenue', fn: 'sum' },
    ]);
    const avg = fingerprintQuery([], null, grouping, undefined, undefined, [
      { columnId: 'revenue', fn: 'avg' },
    ]);
    expect(sum).not.toBe(avg);
  });

  it('differentiates aliases', () => {
    const grouping = { columns: ['status'], openKeys: [] };
    const a = fingerprintQuery([], null, grouping, undefined, undefined, [
      { columnId: 'revenue', fn: 'sum', alias: 'total' },
    ]);
    const b = fingerprintQuery([], null, grouping, undefined, undefined, [
      { columnId: 'revenue', fn: 'sum', alias: 'rev_total' },
    ]);
    expect(a).not.toBe(b);
  });

  it('treats two distinct aggregation orderings as distinct', () => {
    const grouping = { columns: ['status'], openKeys: [] };
    const ab = fingerprintQuery([], null, grouping, undefined, undefined, [
      { columnId: 'revenue', fn: 'sum' },
      { columnId: 'score', fn: 'avg' },
    ]);
    const ba = fingerprintQuery([], null, grouping, undefined, undefined, [
      { columnId: 'score', fn: 'avg' },
      { columnId: 'revenue', fn: 'sum' },
    ]);
    expect(ab).not.toBe(ba);
  });
});
