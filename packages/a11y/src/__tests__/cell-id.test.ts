import { describe, expect, it } from 'vitest';
import { ariaCellId, parseAriaCellId } from '../cell-id';

describe('ariaCellId / parseAriaCellId', () => {
  it('round-trips a canonical id', () => {
    const id = ariaCellId('grid-7', 12, 3);
    expect(id).toBe('grid-7-r12-c3');
    expect(parseAriaCellId(id)).toEqual({ gridId: 'grid-7', row: 12, col: 3 });
  });

  it('handles gridId with hyphens', () => {
    const id = ariaCellId('my-cool-grid', 99, 0);
    expect(parseAriaCellId(id)).toEqual({ gridId: 'my-cool-grid', row: 99, col: 0 });
  });

  it('returns null for non-matching ids', () => {
    expect(parseAriaCellId('not-a-cell-id')).toBeNull();
    expect(parseAriaCellId('grid-r12')).toBeNull();
    expect(parseAriaCellId('')).toBeNull();
  });
});
