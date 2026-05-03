/**
 * Fenwick tree (binary indexed tree) over per-row heights.
 *
 * Provides:
 *   - O(log n) prefixSum(i)         — total height of rows [0, i)
 *   - O(log n) indexAtOffset(y)     — first row whose top edge is > y
 *   - O(log n) update(i, delta)     — add delta to row i's height
 *
 * Storage is a single Float32Array of size n + 1 (1-indexed). For 10M rows
 * that's ~40 MB — significant but tolerable, and zero GC pressure during
 * scroll because no allocation happens on the hot path.
 */
export class FenwickHeights {
  private readonly tree: Float32Array;
  private readonly heights: Float32Array;
  public readonly length: number;

  constructor(heights: ArrayLike<number>) {
    this.length = heights.length;
    this.heights = new Float32Array(heights.length);
    this.tree = new Float32Array(heights.length + 1);
    for (let i = 0; i < heights.length; i++) {
      const h = heights[i] ?? 0;
      this.heights[i] = h;
      this.add(i, h);
    }
  }

  private add(index: number, delta: number): void {
    let i = index + 1;
    while (i <= this.length) {
      this.tree[i] = (this.tree[i] ?? 0) + delta;
      i += i & -i;
    }
  }

  /** Height of a single row. */
  get(index: number): number {
    return this.heights[index] ?? 0;
  }

  /** Sum of heights for rows [0, count). count must be in [0, length]. */
  prefixSum(count: number): number {
    let i = count;
    let sum = 0;
    while (i > 0) {
      sum += this.tree[i] ?? 0;
      i -= i & -i;
    }
    return sum;
  }

  /** Total height of all rows. */
  get totalHeight(): number {
    return this.prefixSum(this.length);
  }

  /**
   * Find the first row index `i` such that prefixSum(i+1) > offset.
   * In other words: which row contains the pixel at vertical offset `y`.
   * Returns length-1 if offset is beyond the bottom.
   */
  indexAtOffset(offset: number): number {
    if (offset <= 0) return 0;
    let i = 0;
    let r = offset;
    let bit = highestPowerOfTwo(this.length);
    while (bit > 0) {
      const next = i + bit;
      if (next <= this.length && (this.tree[next] ?? 0) <= r) {
        r -= this.tree[next] ?? 0;
        i = next;
      }
      bit >>>= 1;
    }
    if (i >= this.length) return this.length - 1;
    return i;
  }

  /** Replace row `index`'s height. */
  setHeight(index: number, newHeight: number): void {
    const cur = this.heights[index] ?? 0;
    if (cur === newHeight) return;
    this.heights[index] = newHeight;
    this.add(index, newHeight - cur);
  }
}

function highestPowerOfTwo(n: number): number {
  if (n <= 0) return 0;
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}
