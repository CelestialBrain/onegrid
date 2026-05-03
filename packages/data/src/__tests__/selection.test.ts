import { describe, expect, it } from 'vitest';
import { BitmapSelection } from '../selection';

describe('BitmapSelection', () => {
  it('starts empty by default', () => {
    const s = new BitmapSelection(10);
    expect(s.cardinality).toBe(0);
    for (let i = 0; i < 10; i++) expect(s.contains(i)).toBe(false);
  });

  it('starts full when constructed with "full"', () => {
    const s = new BitmapSelection(10, 'full');
    expect(s.cardinality).toBe(10);
    for (let i = 0; i < 10; i++) expect(s.contains(i)).toBe(true);
  });

  it('clears extra tail bits when full', () => {
    // length 5 in 1 byte (8 bits available); only the first 5 should be set.
    const s = new BitmapSelection(5, 'full');
    expect(s.cardinality).toBe(5);
    expect(s.contains(4)).toBe(true);
    expect(s.contains(5)).toBe(false);
  });

  it('add/remove update cardinality lazily', () => {
    const s = new BitmapSelection(10);
    s.add(3);
    s.add(5);
    s.add(5); // duplicate add no-op
    expect(s.contains(3)).toBe(true);
    expect(s.contains(5)).toBe(true);
    expect(s.cardinality).toBe(2);
    s.remove(3);
    expect(s.cardinality).toBe(1);
  });

  it('intersect ANDs two bitmaps', () => {
    const a = new BitmapSelection(10);
    a.add(1); a.add(2); a.add(3);
    const b = new BitmapSelection(10);
    b.add(2); b.add(3); b.add(4);
    const c = a.intersect(b);
    expect(c.cardinality).toBe(2);
    expect(c.contains(2)).toBe(true);
    expect(c.contains(3)).toBe(true);
    expect(c.contains(1)).toBe(false);
  });

  it('union ORs two bitmaps', () => {
    const a = new BitmapSelection(10);
    a.add(1);
    const b = new BitmapSelection(10);
    b.add(9);
    const c = a.union(b);
    expect(c.cardinality).toBe(2);
    expect(c.contains(1)).toBe(true);
    expect(c.contains(9)).toBe(true);
  });

  it('invert flips bits within length', () => {
    const a = new BitmapSelection(5);
    a.add(0); a.add(2);
    const b = a.invert();
    expect(b.cardinality).toBe(3);
    expect(b.contains(1)).toBe(true);
    expect(b.contains(3)).toBe(true);
    expect(b.contains(4)).toBe(true);
  });

  it('toIndices returns sorted set bits', () => {
    const a = new BitmapSelection(20);
    [17, 0, 8, 3].forEach((i) => a.add(i));
    expect(Array.from(a.toIndices())).toEqual([0, 3, 8, 17]);
  });

  it('out-of-range adds and contains are no-ops', () => {
    const a = new BitmapSelection(5);
    a.add(-1);
    a.add(100);
    expect(a.contains(-1)).toBe(false);
    expect(a.contains(100)).toBe(false);
    expect(a.cardinality).toBe(0);
  });

  it('throws on length mismatch in intersect/union', () => {
    const a = new BitmapSelection(5);
    const b = new BitmapSelection(10);
    expect(() => a.intersect(b)).toThrow();
    expect(() => a.union(b)).toThrow();
  });
});
