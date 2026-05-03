import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../cursor';

describe('cursor encoding', () => {
  it('round-trips a typical cursor', () => {
    const cur = { sortValues: ['EMEA', 100], rowId: 42 };
    expect(decodeCursor(encodeCursor(cur))).toEqual(cur);
  });

  it('rejects malformed cursors', () => {
    expect(() => decodeCursor('not-base64-or-json')).toThrow();
  });
});
