import { describe, expect, it } from 'vitest';
import { FenwickHeights } from '../fenwick';

describe('FenwickHeights', () => {
  it('reports correct totalHeight for uniform rows', () => {
    const f = new FenwickHeights(new Float32Array(100).fill(24));
    expect(f.totalHeight).toBe(2400);
  });

  it('reports correct prefix sums for variable heights', () => {
    const heights = [10, 20, 30, 40, 50];
    const f = new FenwickHeights(heights);
    expect(f.prefixSum(0)).toBe(0);
    expect(f.prefixSum(1)).toBe(10);
    expect(f.prefixSum(3)).toBe(60);
    expect(f.prefixSum(5)).toBe(150);
  });

  it('indexAtOffset finds the row containing a pixel', () => {
    const f = new FenwickHeights([10, 20, 30, 40, 50]);
    expect(f.indexAtOffset(0)).toBe(0);
    expect(f.indexAtOffset(5)).toBe(0);
    expect(f.indexAtOffset(10)).toBe(1);
    expect(f.indexAtOffset(29)).toBe(1);
    expect(f.indexAtOffset(30)).toBe(2);
    expect(f.indexAtOffset(60)).toBe(3);
    expect(f.indexAtOffset(100)).toBe(4);
    expect(f.indexAtOffset(1_000_000)).toBe(4);
  });

  it('clamps offset <= 0 to row 0', () => {
    const f = new FenwickHeights([10, 20, 30]);
    expect(f.indexAtOffset(-50)).toBe(0);
  });

  it('setHeight updates prefix sums in O(log n)', () => {
    const f = new FenwickHeights([10, 20, 30, 40, 50]);
    f.setHeight(2, 100);
    expect(f.get(2)).toBe(100);
    expect(f.totalHeight).toBe(220);
    expect(f.prefixSum(3)).toBe(130);
  });

  it('handles a 1M-row tree at construction time without overflow', () => {
    const heights = new Float32Array(1_000_000);
    for (let i = 0; i < heights.length; i++) heights[i] = i % 10 < 3 ? 40 : 24;
    const f = new FenwickHeights(heights);
    // 30% × 40 + 70% × 24 ≈ 28.8 avg → ~28.8M total
    expect(f.totalHeight).toBeGreaterThan(28_000_000);
    expect(f.totalHeight).toBeLessThan(29_000_000);
    // Spot-check round-trip: indexAtOffset(prefixSum(i)) should equal i.
    for (const i of [0, 1, 100, 50_000, 999_999]) {
      const off = f.prefixSum(i);
      expect(f.indexAtOffset(off)).toBe(i);
    }
  });
});
