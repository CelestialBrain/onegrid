import { describe, it, expect } from 'vitest';
import { cpuHashAggSumF32 } from '../hash-agg';

describe('cpuHashAggSumF32 (correctness oracle for the GPU kernel)', () => {
  it('groups by key and sums values when buckets are disjoint', () => {
    const keys = new Uint32Array([1, 2, 1, 2, 3]);
    const values = new Float32Array([10, 20, 5, 7, 100]);
    const r = cpuHashAggSumF32(keys, values, { numBuckets: 16 });
    // bucket = key & 15. Keys 1, 2, 3 land in distinct buckets.
    expect(r.bucketSums[1]).toBe(15);  // 10 + 5
    expect(r.bucketSums[2]).toBe(27);  // 20 + 7
    expect(r.bucketSums[3]).toBe(100);
    expect(r.bucketCounts[1]).toBe(2);
    expect(r.bucketCounts[2]).toBe(2);
    expect(r.bucketCounts[3]).toBe(1);
  });

  it('returns the default bucket size for empty input (deterministic)', () => {
    // CPU path treats empty input the same as a non-empty input with
    // zero contributions — buckets exist, all counts are zero.
    const r = cpuHashAggSumF32(new Uint32Array(0), new Float32Array(0));
    expect(r.bucketSums.length).toBe(16);
    expect(r.bucketCounts.every((c) => c === 0)).toBe(true);
  });

  it('uses the documented numBuckets default (nextPow2(max(16, n/4)))', () => {
    // For n = 100, n/4 = 25, max(16, 25) = 25, nextPow2(25) = 32.
    const r = cpuHashAggSumF32(
      new Uint32Array(100),
      new Float32Array(100),
    );
    expect(r.bucketSums.length).toBe(32);
  });

  it('rejects len mismatch', () => {
    expect(() =>
      cpuHashAggSumF32(new Uint32Array(3), new Float32Array(4)),
    ).toThrow(/OG_HASHAGG_LEN_MISMATCH/);
  });

  it('collapses colliding keys into the same bucket (documented limitation)', () => {
    // Keys 1 and 17 both hash to bucket 1 when numBuckets = 16.
    const keys = new Uint32Array([1, 17]);
    const values = new Float32Array([10, 5]);
    const r = cpuHashAggSumF32(keys, values, { numBuckets: 16 });
    expect(r.bucketSums[1]).toBe(15);
    expect(r.bucketCounts[1]).toBe(2);
  });
});
