import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../cursor';

describe('cursor encoding', () => {
  it('round-trips a typical cursor', () => {
    const cur = { sortValues: ['EMEA', 100], rowId: 42 };
    const encoded = encodeCursor(cur);
    expect(typeof encoded).toBe('string');
    expect(decodeCursor(encoded)).toEqual(cur);
  });

  it('handles empty sortValues', () => {
    const cur = { sortValues: [], rowId: 'abc' };
    expect(decodeCursor(encodeCursor(cur))).toEqual(cur);
  });

  it('handles bigint-equivalent rowId as number', () => {
    const cur = { sortValues: [null], rowId: 1234567890123 };
    expect(decodeCursor(encodeCursor(cur))).toEqual(cur);
  });

  it('rejects malformed cursors', () => {
    expect(() => decodeCursor('not-base64-or-json')).toThrow();
    const garbage = encodeCursor({ sortValues: [] } as unknown as { sortValues: unknown[]; rowId: number });
    // sortValues without rowId — should fail validation.
    expect(() => decodeCursor(garbage)).toThrow();
  });
});
