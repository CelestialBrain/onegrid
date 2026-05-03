import { describe, expect, it } from 'vitest';
import { createColumnTable } from '../column-table';
import type { ColumnInput } from '../column-table';

const intCol: ColumnInput = {
  schema: { id: 'id', type: 'int32' },
  data: new Int32Array([10, 20, 30, 40, 50]),
};

const stringCol: ColumnInput = {
  schema: { id: 'name', type: 'utf8' },
  data: ['a', 'b', 'c', 'd', 'e'],
};

describe('createColumnTable', () => {
  it('exposes schema and numRows', () => {
    const t = createColumnTable([intCol, stringCol]);
    expect(t.numRows).toBe(5);
    expect(t.schema).toHaveLength(2);
    expect(t.schema[0]?.id).toBe('id');
  });

  it('reads cells via column.get', () => {
    const t = createColumnTable([intCol, stringCol]);
    expect(t.column('id').get(0)).toBe(10);
    expect(t.column('id').get(4)).toBe(50);
    expect(t.column('name').get(2)).toBe('c');
  });

  it('returns undefined for out-of-range reads', () => {
    const t = createColumnTable([intCol, stringCol]);
    expect(t.column('id').get(-1)).toBeUndefined();
    expect(t.column('id').get(99)).toBeUndefined();
  });

  it('throws for unknown column ids', () => {
    const t = createColumnTable([intCol]);
    expect(() => t.column('missing')).toThrow();
  });

  it('rejects mismatched column lengths', () => {
    const a: ColumnInput = { schema: { id: 'a', type: 'int32' }, data: new Int32Array([1]) };
    const b: ColumnInput = {
      schema: { id: 'b', type: 'int32' },
      data: new Int32Array([1, 2]),
    };
    expect(() => createColumnTable([a, b])).toThrow();
  });

  it('slice produces a zero-copy view with shifted indices', () => {
    const t = createColumnTable([intCol, stringCol]);
    const s = t.slice(1, 3);
    expect(s.numRows).toBe(3);
    expect(s.column('id').get(0)).toBe(20);
    expect(s.column('id').get(2)).toBe(40);
    expect(s.column('name').get(1)).toBe('c');
  });

  it('slice clamps offset and length to bounds', () => {
    const t = createColumnTable([intCol]);
    const s = t.slice(3, 100);
    expect(s.numRows).toBe(2);
    expect(s.column('id').get(0)).toBe(40);
    expect(s.column('id').get(1)).toBe(50);
  });

  it('isNull derives from validity bitmap when present', () => {
    const validity = new Uint8Array([0b00000101]); // rows 0, 2 are non-null
    const col: ColumnInput = {
      schema: { id: 'x', type: 'int32', nullable: true },
      data: new Int32Array([1, 0, 3, 0, 0]),
      validity,
    };
    const t = createColumnTable([col]);
    expect(t.column('x').isNull(0)).toBe(false);
    expect(t.column('x').isNull(1)).toBe(true);
    expect(t.column('x').isNull(2)).toBe(false);
    expect(t.column('x').isNull(3)).toBe(true);
  });

  it('isNull falls back to value === null/undefined when no validity', () => {
    const col: ColumnInput = {
      schema: { id: 'x', type: 'utf8', nullable: true },
      data: ['a', null, 'c', undefined],
    };
    const t = createColumnTable([col]);
    expect(t.column('x').isNull(0)).toBe(false);
    expect(t.column('x').isNull(1)).toBe(true);
    expect(t.column('x').isNull(3)).toBe(true);
  });

  it('returns an empty table for zero columns without crashing', () => {
    const t = createColumnTable([]);
    expect(t.numRows).toBe(0);
    expect(() => t.column('any')).toThrow();
  });
});
