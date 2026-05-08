// =============================================================================
// Aggregation pushdown over SSRM — real-server gate.
//
// Asserts that the mock server, when handed a `BlockRequest` with
// `grouping` + `aggregations`, returns ONE row per distinct group key
// with the aggregate alias columns populated — instead of round-
// tripping every raw row in each group. That's the entire point of
// pushdown: a 1M-row dataset becomes 5 group-summary rows on the
// wire.
//
// Wire-format expectations:
//   - One row per top-level group key (status: active / pending / ...)
//   - Each row carries `__count__` (per-group row count for the
//     chevron / count badge)
//   - Each row carries the aggregation-alias columns
//     (default name: `${fn}_${columnId}`)
//
// Reference: ROADMAP.md v0.0.8 item 2.
// =============================================================================

import { expect, test } from '@playwright/test';

test('grouping + aggregations returns one rollup row per group', async ({ request }) => {
  const res = await request.post('http://localhost:3001/block', {
    data: {
      cursor: null,
      direction: 'after',
      limit: 1000,
      sort: [],
      filter: null,
      grouping: { columns: ['status'], openKeys: [] },
      aggregations: [
        { columnId: 'revenue', fn: 'sum' },
        { columnId: 'score', fn: 'avg' },
      ],
    },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    rows: Array<Record<string, unknown>>;
    totalRowCount?: number;
  };
  // Five distinct status values in the synthetic dataset.
  expect(body.rows.length).toBe(5);

  for (const row of body.rows) {
    expect(typeof row.status).toBe('string');
    expect(typeof row.__count__).toBe('number');
    expect(row.__count__).toBeGreaterThan(0);
    expect(typeof row.sum_revenue).toBe('number');
    expect(typeof row.avg_score).toBe('number');
  }

  // Per-group counts add up to the full table.
  const total = body.rows.reduce(
    (acc, r) => acc + (r.__count__ as number),
    0,
  );
  expect(total).toBe(1_000_000);
});

test('grouping without aggregations returns count-only group rows', async ({
  request,
}) => {
  const res = await request.post('http://localhost:3001/block', {
    data: {
      cursor: null,
      direction: 'after',
      limit: 1000,
      sort: [],
      filter: null,
      grouping: { columns: ['status'], openKeys: [] },
    },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    rows: Array<Record<string, unknown>>;
  };
  expect(body.rows.length).toBe(5);
  for (const row of body.rows) {
    expect(typeof row.__count__).toBe('number');
    // No aggregation aliases on rows when none were requested.
    expect(row.sum_revenue).toBeUndefined();
    expect(row.avg_score).toBeUndefined();
  }
});

test('aggregations are scoped to the active filter', async ({ request }) => {
  // Filter: status === 'active'. The grouping pushdown should still
  // emit one row per group (just 'active'), with __count__ matching
  // only the filtered rows.
  const res = await request.post('http://localhost:3001/block', {
    data: {
      cursor: null,
      direction: 'after',
      limit: 1000,
      sort: [],
      filter: {
        type: 'comparison',
        columnId: 'status',
        op: 'eq',
        value: 'active',
      },
      grouping: { columns: ['status'], openKeys: [] },
      aggregations: [{ columnId: 'revenue', fn: 'sum' }],
    },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    rows: Array<Record<string, unknown>>;
  };
  expect(body.rows.length).toBe(1);
  expect(body.rows[0]?.status).toBe('active');
  // 1M rows / 5 statuses = 200_000 active rows.
  expect(body.rows[0]?.__count__).toBe(200_000);
});
