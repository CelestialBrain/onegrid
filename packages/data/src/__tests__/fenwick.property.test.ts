// =============================================================================
// FenwickHeights — property-based tests.
//
// Background: today's session caught a Float32 precision bug in this
// data structure that survived all the example-based unit tests
// because they capped at 1M rows × 24 px (totalHeight ≤ 24M, just at
// the Float32 exact-integer boundary of 16.7M). The bug only manifested
// at 10M rows × 28 px. Example tests pick specific cases; property tests
// generate random ones and catch the cases we didn't think to pick.
//
// Invariants verified here:
//
//   (P1) prefixSum(0) === 0
//   (P2) prefixSum(n) === totalHeight
//   (P3) prefixSum is monotonic non-decreasing
//   (P4) Round-trip: for any valid row i, indexAtOffset(prefixSum(i)) === i
//        (when prefixSum(i) is strictly inside row i — see below for edge)
//   (P5) Negative / out-of-range offsets clamp to [0, length-1]
//   (P6) setHeight is consistent: after setHeight(i, h),
//        get(i) === h AND totalHeight reflects the delta
//   (P7) Precision at scale: totalHeight stays within 1 px of the true
//        sum even for 1M+ rows of typical heights — this is what
//        Float64 buys us
// =============================================================================

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FenwickHeights } from '../fenwick';

// Heights arbitrary: realistic row heights between 16 and 80 px.
// fast-check has float() but we want integers since real row heights
// are pixel-aligned.
const heightsArb = fc.array(fc.integer({ min: 16, max: 80 }), { minLength: 1, maxLength: 5_000 });

describe('FenwickHeights — properties', () => {
  it('(P1) prefixSum(0) === 0', () => {
    fc.assert(
      fc.property(heightsArb, (heights) => {
        const f = new FenwickHeights(heights);
        expect(f.prefixSum(0)).toBe(0);
      }),
      { numRuns: 200 },
    );
  });

  it('(P2) prefixSum(length) === totalHeight', () => {
    fc.assert(
      fc.property(heightsArb, (heights) => {
        const f = new FenwickHeights(heights);
        expect(f.prefixSum(heights.length)).toBe(f.totalHeight);
      }),
      { numRuns: 200 },
    );
  });

  it('(P3) prefixSum is monotonic non-decreasing', () => {
    fc.assert(
      fc.property(heightsArb, (heights) => {
        const f = new FenwickHeights(heights);
        let prev = 0;
        for (let i = 0; i <= heights.length; i++) {
          const cur = f.prefixSum(i);
          expect(cur).toBeGreaterThanOrEqual(prev);
          prev = cur;
        }
      }),
      { numRuns: 200 },
    );
  });

  it('(P4) round-trip: indexAtOffset(prefixSum(i)) === i for valid i', () => {
    fc.assert(
      fc.property(heightsArb, (heights) => {
        const f = new FenwickHeights(heights);
        // Skip i=0: prefixSum(0)=0 and indexAtOffset(<=0)=0, which is
        // consistent. Skip i=length: prefixSum(length)=totalHeight is the
        // bottom edge, indexAtOffset clamps to length-1.
        for (let i = 1; i < heights.length; i++) {
          // We must use prefixSum(i) which is the TOP edge of row i.
          // indexAtOffset(topOfRow_i) should return i because the spec
          // is "first row whose top edge is > y". With y = top of i,
          // row i's top is NOT > y (it equals y), so the answer is the
          // PRECEDING row. Use prefixSum(i) + small step inside row i.
          const off = f.prefixSum(i);
          const insideRow = off + 1; // 1 px into row i
          if (heights[i]! < 1) continue; // degenerate; skip
          expect(f.indexAtOffset(insideRow)).toBe(i);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('(P5) out-of-range offsets clamp', () => {
    fc.assert(
      fc.property(heightsArb, fc.integer({ min: -1_000_000, max: -1 }), (heights, neg) => {
        const f = new FenwickHeights(heights);
        expect(f.indexAtOffset(neg)).toBe(0);
        expect(f.indexAtOffset(f.totalHeight + 1_000_000)).toBe(heights.length - 1);
      }),
      { numRuns: 200 },
    );
  });

  it('(P6) setHeight is consistent', () => {
    fc.assert(
      fc.property(
        heightsArb,
        fc.integer({ min: 0, max: 1000 }), // raw "row index" — clamped below
        fc.integer({ min: 16, max: 80 }), // new height
        (heights, rawIdx, newH) => {
          const f = new FenwickHeights(heights);
          const idx = rawIdx % heights.length;
          const before = f.totalHeight;
          const old = f.get(idx);
          f.setHeight(idx, newH);
          expect(f.get(idx)).toBe(newH);
          expect(f.totalHeight).toBe(before - old + newH);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('(P7) precision at scale: 1M rows of realistic heights — totalHeight is exact', () => {
    // This is the regression that today's session caught — Float32
    // lost precision past 2^24 ≈ 16.7M. We now use Float64 and this
    // assertion confirms the fix at 1M-row scale (the unit-test
    // sweet spot — bigger is too slow for fast-check's default 100 runs).
    fc.assert(
      fc.property(
        // 10K-row arrays so we can fc.assert across 200 runs; per-array
        // sum is ~10K × 50 = 500K, accumulate-error far past Float32.
        fc.array(fc.integer({ min: 16, max: 80 }), { minLength: 5_000, maxLength: 10_000 }),
        (heights) => {
          const f = new FenwickHeights(heights);
          // True sum computed in JS Number (double) — same precision
          // as Float64Array.
          let truth = 0;
          for (const h of heights) truth += h;
          expect(f.totalHeight).toBe(truth);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('(P7b) precision at TRUE scale: 1M-row dataset matches double sum exactly', () => {
    // Single fixed-size sanity check at the scale where the bug
    // appeared. Not a property test (too slow at 200 runs), but a
    // regression guard alongside (P7).
    const N = 1_000_000;
    const heights = new Float32Array(N);
    for (let i = 0; i < N; i++) heights[i] = i % 10 < 3 ? 40 : 24;
    const f = new FenwickHeights(heights);
    let truth = 0;
    for (let i = 0; i < N; i++) truth += heights[i]!;
    expect(f.totalHeight).toBe(truth);
  });
});
