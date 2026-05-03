import { describe, expect, it } from 'vitest';
import { createColumnTable, type ColumnInput } from '../column-table';
import { sortIndex } from '../sort';

const idCol: ColumnInput = {
  schema: { id: 'id', type: 'int32' },
  data: new Int32Array([3, 1, 4, 1, 5, 9, 2, 6]),
};

const nameCol: ColumnInput = {
  schema: { id: 'name', type: 'utf8' },
  data: ['Charlie', 'Alice', 'Charlie', 'Alice', 'Bob', 'Eve', 'Alice', 'Bob'],
};

describe('sortIndex', () => {
  it('returns identity for empty sort', () => {
    const t = createColumnTable([idCol]);
    const perm = sortIndex(t, []);
    expect(Array.from(perm)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('sorts ascending by a numeric column', () => {
    const t = createColumnTable([idCol]);
    const perm = sortIndex(t, [{ columnId: 'id', direction: 'asc' }]);
    const sorted = Array.from(perm).map((i) => t.column('id').get(i));
    expect(sorted).toEqual([1, 1, 2, 3, 4, 5, 6, 9]);
  });

  it('sorts descending', () => {
    const t = createColumnTable([idCol]);
    const perm = sortIndex(t, [{ columnId: 'id', direction: 'desc' }]);
    const sorted = Array.from(perm).map((i) => t.column('id').get(i));
    expect(sorted).toEqual([9, 6, 5, 4, 3, 2, 1, 1]);
  });

  it('multi-column sort respects priority and is stable', () => {
    const t = createColumnTable([idCol, nameCol]);
    // First by name asc, tiebreak id asc.
    const perm = sortIndex(t, [
      { columnId: 'name', direction: 'asc' },
      { columnId: 'id', direction: 'asc' },
    ]);
    const sorted = Array.from(perm).map((i) => ({
      name: t.column('name').get(i),
      id: t.column('id').get(i),
    }));
    expect(sorted).toEqual([
      { name: 'Alice', id: 1 },
      { name: 'Alice', id: 1 },
      { name: 'Alice', id: 2 },
      { name: 'Bob', id: 5 },
      { name: 'Bob', id: 6 },
      { name: 'Charlie', id: 3 },
      { name: 'Charlie', id: 4 },
      { name: 'Eve', id: 9 },
    ]);
  });

  it('handles nulls last by default', () => {
    const t = createColumnTable([
      {
        schema: { id: 'x', type: 'int32', nullable: true },
        data: [3, null, 1, null, 2],
      },
    ]);
    const perm = sortIndex(t, [{ columnId: 'x', direction: 'asc' }]);
    const sorted = Array.from(perm).map((i) => t.column('x').get(i));
    expect(sorted).toEqual([1, 2, 3, null, null]);
  });

  it('honors nulls: "first"', () => {
    const t = createColumnTable([
      {
        schema: { id: 'x', type: 'int32', nullable: true },
        data: [3, null, 1, null, 2],
      },
    ]);
    const perm = sortIndex(t, [{ columnId: 'x', direction: 'asc', nulls: 'first' }]);
    const sorted = Array.from(perm).map((i) => t.column('x').get(i));
    expect(sorted).toEqual([null, null, 1, 2, 3]);
  });

  it('uses Intl collator for string columns (case-insensitive accent ordering)', () => {
    const t = createColumnTable([
      {
        schema: { id: 's', type: 'utf8' },
        data: ['banana', 'Apple', 'cherry'],
      },
    ]);
    const perm = sortIndex(t, [{ columnId: 's', direction: 'asc' }]);
    const sorted = Array.from(perm).map((i) => t.column('s').get(i));
    expect(sorted).toEqual(['Apple', 'banana', 'cherry']);
  });
});
