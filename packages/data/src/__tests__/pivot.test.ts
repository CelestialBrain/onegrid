import { describe, expect, it } from 'vitest';
import { createColumnTable, type ColumnInput } from '../column-table';
import { pivot } from '../pivot';

const regionCol: ColumnInput = {
  schema: { id: 'region', type: 'utf8' },
  data: ['EMEA', 'AMER', 'EMEA', 'APAC', 'AMER', 'EMEA'],
};
const statusCol: ColumnInput = {
  schema: { id: 'status', type: 'utf8' },
  data: ['active', 'active', 'churned', 'active', 'churned', 'active'],
};
const revenueCol: ColumnInput = {
  schema: { id: 'revenue', type: 'int32' },
  data: new Int32Array([100, 200, 150, 50, 300, 75]),
};

describe('pivot', () => {
  it('produces one row per distinct rowGroup tuple', () => {
    const t = createColumnTable([regionCol, statusCol, revenueCol]);
    const out = pivot(t, {
      rows: ['region'],
      columns: ['status'],
      measures: [{ fn: 'sum', columnId: 'revenue', alias: 'rev' }],
    });
    expect(out.table.numRows).toBe(3);
    const regionVec = out.table.column('region');
    const regions = [0, 1, 2].map((i) => regionVec.get(i));
    expect(regions).toEqual(['AMER', 'APAC', 'EMEA']);
  });

  it('emits one column per (pivotKey × measure) combination', () => {
    const t = createColumnTable([regionCol, statusCol, revenueCol]);
    const out = pivot(t, {
      rows: ['region'],
      columns: ['status'],
      measures: [
        { fn: 'sum', columnId: 'revenue', alias: 'rev' },
        { fn: 'count', columnId: 'revenue', alias: 'n' },
      ],
    });
    // status has 2 distinct values × 2 measures = 4 synthetic columns.
    expect(out.pivotColumns).toHaveLength(4);
    const ids = out.pivotColumns.map((c) => c.id).sort();
    expect(ids).toEqual([
      'n__active',
      'n__churned',
      'rev__active',
      'rev__churned',
    ]);
  });

  it('aggregates correctly across each (row, pivot) bucket', () => {
    const t = createColumnTable([regionCol, statusCol, revenueCol]);
    const out = pivot(t, {
      rows: ['region'],
      columns: ['status'],
      measures: [{ fn: 'sum', columnId: 'revenue', alias: 'rev' }],
    });
    // Find AMER row and read rev_active (200) + rev_churned (300).
    const regionVec = out.table.column('region');
    const rowIdx = [0, 1, 2].findIndex((i) => regionVec.get(i) === 'AMER');
    const active = out.table.column('rev__active').get(rowIdx);
    const churned = out.table.column('rev__churned').get(rowIdx);
    expect(active).toBe(200);
    expect(churned).toBe(300);
  });

  it('writes NaN for empty buckets so consumers can detect them', () => {
    const t = createColumnTable([regionCol, statusCol, revenueCol]);
    const out = pivot(t, {
      rows: ['region'],
      columns: ['status'],
      measures: [{ fn: 'sum', columnId: 'revenue' }],
    });
    // APAC has only 'active' rows, so its 'churned' bucket is empty.
    const regionVec = out.table.column('region');
    const rowIdx = [0, 1, 2].findIndex((i) => regionVec.get(i) === 'APAC');
    const churnedColId = out.pivotColumns.find((c) => String(c.pivotPath[0]) === 'churned')!.id;
    const v = out.table.column(churnedColId).get(rowIdx) as number;
    expect(Number.isNaN(v)).toBe(true);
  });
});
