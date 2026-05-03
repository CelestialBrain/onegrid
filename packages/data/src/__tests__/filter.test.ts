import { describe, expect, it } from 'vitest';
import { createColumnTable, type ColumnInput } from '../column-table';
import { filterIndex } from '../filter';
import type { FilterModel } from '@onegrid/protocol';

const ageCol: ColumnInput = {
  schema: { id: 'age', type: 'int32' },
  data: new Int32Array([25, 30, 35, 40, 45, 50]),
};

const nameCol: ColumnInput = {
  schema: { id: 'name', type: 'utf8' },
  data: ['alice', 'bob', 'CHARLIE', 'David', 'eve', 'Frank'],
};

const tagCol: ColumnInput = {
  schema: { id: 'tag', type: 'utf8', nullable: true },
  data: ['a', null, 'b', 'a', null, 'c'],
};

describe('filterIndex', () => {
  it('null filter returns all rows', () => {
    const t = createColumnTable([ageCol]);
    const sel = filterIndex(t, null);
    expect(sel.cardinality).toBe(6);
  });

  it('eq matches exactly', () => {
    const t = createColumnTable([ageCol]);
    const filter: FilterModel = {
      type: 'comparison',
      columnId: 'age',
      op: 'eq',
      value: 30,
    };
    const sel = filterIndex(t, filter);
    expect(sel.cardinality).toBe(1);
    expect(sel.contains(1)).toBe(true);
  });

  it('gt and lt filter ranges', () => {
    const t = createColumnTable([ageCol]);
    expect(filterIndex(t, { type: 'comparison', columnId: 'age', op: 'gt', value: 35 }).cardinality).toBe(3);
    expect(filterIndex(t, { type: 'comparison', columnId: 'age', op: 'lte', value: 35 }).cardinality).toBe(3);
  });

  it('in matches set membership', () => {
    const t = createColumnTable([ageCol]);
    const sel = filterIndex(t, {
      type: 'comparison',
      columnId: 'age',
      op: 'in',
      values: [25, 45],
    });
    expect(sel.cardinality).toBe(2);
  });

  it('between is inclusive on both ends', () => {
    const t = createColumnTable([ageCol]);
    const sel = filterIndex(t, {
      type: 'comparison',
      columnId: 'age',
      op: 'between',
      values: [30, 40],
    });
    expect(sel.cardinality).toBe(3);
  });

  it('contains is case-insensitive by default', () => {
    const t = createColumnTable([nameCol]);
    const sel = filterIndex(t, {
      type: 'comparison',
      columnId: 'name',
      op: 'contains',
      value: 'a',
    });
    // alice, CHARLIE, David, Frank → 4 matches case-insensitive
    expect(sel.cardinality).toBe(4);
  });

  it('contains respects caseSensitive: true', () => {
    const t = createColumnTable([nameCol]);
    const sel = filterIndex(t, {
      type: 'comparison',
      columnId: 'name',
      op: 'contains',
      value: 'a',
      caseSensitive: true,
    });
    // lowercase 'a' in: alice, David, Frank — but NOT CHARLIE (capital A only).
    expect(sel.cardinality).toBe(3);
  });

  it('isNull / isNotNull respect validity', () => {
    const t = createColumnTable([tagCol]);
    expect(filterIndex(t, { type: 'comparison', columnId: 'tag', op: 'isNull' }).cardinality).toBe(2);
    expect(filterIndex(t, { type: 'comparison', columnId: 'tag', op: 'isNotNull' }).cardinality).toBe(4);
  });

  it('and / or / not compose', () => {
    const t = createColumnTable([ageCol, nameCol]);
    const sel = filterIndex(t, {
      type: 'logical',
      op: 'and',
      filters: [
        { type: 'comparison', columnId: 'age', op: 'gt', value: 30 },
        {
          type: 'logical',
          op: 'or',
          filters: [
            { type: 'comparison', columnId: 'name', op: 'startsWith', value: 'c' },
            { type: 'comparison', columnId: 'name', op: 'startsWith', value: 'f' },
          ],
        },
      ],
    });
    // age > 30 AND (name starts with c OR f) — case-insensitive
    // Rows: 35/CHARLIE (yes), 40/David (no), 45/eve (no), 50/Frank (yes) → 2
    expect(sel.cardinality).toBe(2);
  });

  it('returns empty selection when column is unknown', () => {
    const t = createColumnTable([ageCol]);
    const sel = filterIndex(t, {
      type: 'comparison',
      columnId: 'missing',
      op: 'eq',
      value: 1,
    });
    expect(sel.cardinality).toBe(0);
  });
});
