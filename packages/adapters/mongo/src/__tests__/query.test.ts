// =============================================================================
// MongoDB query compiler — unit tests.
//
// Mongo's idiom is the most different from SQL: the compiler emits
// query documents (`{ field: { $eq: ... } }`) and aggregation
// pipelines (`[{ $match: ... }, { $group: ... }]`). Tests assert
// on the shape of those JS objects directly.
// =============================================================================

import { describe, expect, it } from 'vitest';
import type { BlockRequest } from '@onegrid/protocol';
import {
  compileBlockQuery,
  decodeKeysetCursor,
  encodeKeysetCursor,
  type CompiledFlatQuery,
  type CompiledAggregateQuery,
  type MongoCollectionDescriptor,
} from '../query';

const COLL: MongoCollectionDescriptor = {
  collection: 'orders',
  fields: ['_id', 'status', 'amount', 'customer'],
  primaryKey: '_id',
};

function req(overrides: Partial<BlockRequest> = {}): BlockRequest {
  return {
    cursor: null,
    direction: 'after',
    limit: 100,
    sort: [],
    filter: null,
    ...overrides,
  };
}

describe('compileBlockQuery — flat (find) path', () => {
  it('returns kind=find with sort + projection + limit', () => {
    const out = compileBlockQuery(req(), COLL, null) as CompiledFlatQuery;
    expect(out.kind).toBe('find');
    expect(out.filter).toEqual({});
    expect(out.sort).toEqual({ _id: 1 });
    expect(out.limit).toBe(100);
    expect(out.projection).toMatchObject({
      _id: 1,
      status: 1,
      amount: 1,
      customer: 1,
    });
  });

  it('translates a comparison filter into a query document', () => {
    const out = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'status',
          op: 'eq',
          value: 'active',
        },
      }),
      COLL,
      null,
    ) as CompiledFlatQuery;
    expect(out.filter).toEqual({ status: { $eq: 'active' } });
  });

  it('translates IN / NOT IN to $in / $nin', () => {
    const out = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'status',
          op: 'in',
          values: ['active', 'pending'],
        },
      }),
      COLL,
      null,
    ) as CompiledFlatQuery;
    expect(out.filter).toEqual({ status: { $in: ['active', 'pending'] } });
  });

  it('translates contains to a $regex with i option for case-insensitive', () => {
    const out = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'customer',
          op: 'contains',
          value: 'Foo',
          caseSensitive: false,
        },
      }),
      COLL,
      null,
    ) as CompiledFlatQuery;
    expect(out.filter).toEqual({
      customer: { $regex: 'Foo', $options: 'i' },
    });
  });

  it('escapes regex-special characters in contains', () => {
    const out = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'customer',
          op: 'contains',
          value: 'a.b*c',
        },
      }),
      COLL,
      null,
    ) as CompiledFlatQuery;
    expect(out.filter).toEqual({ customer: { $regex: 'a\\.b\\*c' } });
  });

  it('translates startsWith / endsWith to anchored regex', () => {
    const sw = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'customer',
          op: 'startsWith',
          value: 'Co',
        },
      }),
      COLL,
      null,
    ) as CompiledFlatQuery;
    expect(sw.filter).toEqual({ customer: { $regex: '^Co' } });
    const ew = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'customer',
          op: 'endsWith',
          value: 'Inc',
        },
      }),
      COLL,
      null,
    ) as CompiledFlatQuery;
    expect(ew.filter).toEqual({ customer: { $regex: 'Inc$' } });
  });

  it('translates between to $gte + $lte', () => {
    const out = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'amount',
          op: 'between',
          values: [10, 100],
        },
      }),
      COLL,
      null,
    ) as CompiledFlatQuery;
    expect(out.filter).toEqual({ amount: { $gte: 10, $lte: 100 } });
  });

  it('translates AND / OR / NOT logical filters', () => {
    const out = compileBlockQuery(
      req({
        filter: {
          type: 'logical',
          op: 'and',
          filters: [
            { type: 'comparison', columnId: 'status', op: 'eq', value: 'a' },
            {
              type: 'logical',
              op: 'or',
              filters: [
                { type: 'comparison', columnId: 'amount', op: 'gt', value: 100 },
                {
                  type: 'logical',
                  op: 'not',
                  filters: [
                    { type: 'comparison', columnId: 'customer', op: 'eq', value: 'x' },
                  ],
                },
              ],
            },
          ],
        },
      }),
      COLL,
      null,
    ) as CompiledFlatQuery;
    expect(out.filter).toEqual({
      $and: [
        { status: { $eq: 'a' } },
        {
          $or: [
            { amount: { $gt: 100 } },
            { $nor: [{ customer: { $eq: 'x' } }] },
          ],
        },
      ],
    });
  });

  it('produces sort objects with 1 / -1', () => {
    const out = compileBlockQuery(
      req({
        sort: [
          { columnId: 'amount', direction: 'desc' },
          { columnId: 'status', direction: 'asc' },
        ],
      }),
      COLL,
      null,
    ) as CompiledFlatQuery;
    expect(out.sort).toEqual({ amount: -1, status: 1, _id: 1 });
  });

  it('keyset cursor expands to chained $or row-tuple comparison', () => {
    const cursor = decodeKeysetCursor(
      encodeKeysetCursor({ sortValues: ['active', 50], rowId: 7 }),
    );
    const out = compileBlockQuery(
      req({
        sort: [
          { columnId: 'status', direction: 'asc' },
          { columnId: 'amount', direction: 'asc' },
        ],
      }),
      COLL,
      cursor,
    ) as CompiledFlatQuery;
    expect(out.filter).toEqual({
      $or: [
        { status: { $gt: 'active' } },
        { status: { $eq: 'active' }, amount: { $gt: 50 } },
        { status: { $eq: 'active' }, amount: { $eq: 50 }, _id: { $gt: 7 } },
      ],
    });
  });

  it('rejects unknown fields', () => {
    expect(() =>
      compileBlockQuery(req({ columns: ['secret'] }), COLL, null),
    ).toThrow(/unknown field "secret"/);
  });
});

describe('compileBlockQuery — aggregate path', () => {
  it('produces $match → $group → $project → $sort', () => {
    const out = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'status',
          op: 'eq',
          value: 'active',
        },
        grouping: { columns: ['status'], openKeys: [] },
        aggregations: [
          { columnId: 'amount', fn: 'sum' },
          { columnId: 'amount', fn: 'avg' },
        ],
      }),
      COLL,
      null,
    ) as CompiledAggregateQuery;
    expect(out.kind).toBe('aggregate');
    expect(out.pipeline.length).toBe(4);
    expect(out.pipeline[0]).toEqual({
      $match: { status: { $eq: 'active' } },
    });
    expect(out.pipeline[1]).toEqual({
      $group: {
        _id: '$status',
        __count__: { $sum: 1 },
        sum_amount: { $sum: '$amount' },
        avg_amount: { $avg: '$amount' },
      },
    });
    expect(out.pipeline[2]).toEqual({
      $project: {
        _id: 0,
        __count__: 1,
        status: '$_id',
        sum_amount: 1,
        avg_amount: 1,
      },
    });
    expect(out.pipeline[3]).toEqual({ $sort: { status: 1 } });
  });

  it('multi-column grouping uses object _id', () => {
    const out = compileBlockQuery(
      req({
        grouping: { columns: ['status', 'customer'], openKeys: [] },
      }),
      COLL,
      null,
    ) as CompiledAggregateQuery;
    expect(out.pipeline[0]).toEqual({
      $group: {
        _id: { status: '$status', customer: '$customer' },
        __count__: { $sum: 1 },
      },
    });
    expect(out.pipeline[1]).toEqual({
      $project: {
        _id: 0,
        __count__: 1,
        status: '$_id.status',
        customer: '$_id.customer',
      },
    });
  });

  it('rejects unsupported aggregation fns', () => {
    expect(() =>
      compileBlockQuery(
        req({
          grouping: { columns: ['status'], openKeys: [] },
          aggregations: [{ columnId: 'amount', fn: 'first' }],
        }),
        COLL,
        null,
      ),
    ).toThrow(/unsupported aggregation/);
  });
});
