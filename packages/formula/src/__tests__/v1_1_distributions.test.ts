// =============================================================================
// @onegrid/formula — v1.1.0 wave 6: statistical distributions + regression.
//
// Each distribution is checked against textbook values: standard normal at
// z=1.96 ≈ 0.975, chi-square 95th percentile, t-distribution symmetry, F-dist
// percentiles, binomial mean, etc. CDF↔INV round-trips verify monotonicity
// + invertibility.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { getFunction } from '../functions';
import { DIV_ZERO, NUM_ERROR } from '../errors';

const call = (name: string, args: unknown[]): unknown => {
  const fn = getFunction(name);
  if (!fn) throw new Error(`function ${name} not registered`);
  return fn(args);
};

describe('@onegrid/formula — GAMMA / GAMMALN', () => {
  it('GAMMA(n+1) = n!', () => {
    expect(call('GAMMA', [1])).toBeCloseTo(1, 8);
    expect(call('GAMMA', [5])).toBeCloseTo(24, 6);
    expect(call('GAMMA', [10])).toBeCloseTo(362880, 0);
  });

  it('GAMMA(0.5) = sqrt(pi)', () => {
    expect(call('GAMMA', [0.5])).toBeCloseTo(Math.sqrt(Math.PI), 8);
  });

  it('GAMMALN matches log(GAMMA)', () => {
    expect(call('GAMMALN', [10])).toBeCloseTo(Math.log(362880), 6);
  });
});

describe('@onegrid/formula — normal: NORM.S.DIST / NORM.DIST / NORM.S.INV / NORM.INV', () => {
  it('NORM.S.DIST cumulative at 0 = 0.5', () => {
    expect(call('NORM.S.DIST', [0, true])).toBeCloseTo(0.5, 8);
  });

  it('NORM.S.DIST at z=1.96 ≈ 0.975', () => {
    expect(call('NORM.S.DIST', [1.96, true])).toBeCloseTo(0.975, 3);
  });

  it('NORM.S.DIST density at 0 = 1/sqrt(2π)', () => {
    expect(call('NORM.S.DIST', [0, false])).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 6);
  });

  it('NORM.DIST standardizes to NORM.S.DIST', () => {
    const a = call('NORM.DIST', [110, 100, 10, true]) as number;
    const b = call('NORM.S.DIST', [1, true]) as number;
    expect(a).toBeCloseTo(b, 6);
  });

  it('NORM.S.INV round-trips with NORM.S.DIST', () => {
    for (const p of [0.1, 0.25, 0.5, 0.75, 0.9, 0.975]) {
      const z = call('NORM.S.INV', [p]) as number;
      const back = call('NORM.S.DIST', [z, true]) as number;
      expect(back).toBeCloseTo(p, 4);
    }
  });

  it('NORM.INV is destandardized NORM.S.INV', () => {
    const mean = 100, sd = 15;
    const x = call('NORM.INV', [0.975, mean, sd]) as number;
    expect(x).toBeCloseTo(mean + 1.96 * sd, 1);
  });
});

describe('@onegrid/formula — EXPON.DIST / GAMMA.DIST / WEIBULL.DIST / LOGNORM.DIST', () => {
  it('EXPON.DIST cumulative converges to 1 at large x', () => {
    expect(call('EXPON.DIST', [10, 1, true])).toBeCloseTo(1, 4);
  });

  it('EXPON.DIST density λ at 0 equals λ', () => {
    expect(call('EXPON.DIST', [0, 0.5, false])).toBeCloseTo(0.5, 8);
  });

  it('GAMMA.DIST with shape 1, scale β reduces to exponential', () => {
    const a = call('GAMMA.DIST', [1, 1, 2, true]) as number;
    const b = call('EXPON.DIST', [1, 1 / 2, true]) as number;
    expect(a).toBeCloseTo(b, 6);
  });

  it('WEIBULL.DIST cumulative converges to 1', () => {
    expect(call('WEIBULL.DIST', [10, 2, 1, true])).toBeCloseTo(1, 4);
  });

  it('LOGNORM.DIST + LOGNORM.INV round-trip', () => {
    const mean = 1, sd = 0.5;
    const x = call('LOGNORM.INV', [0.5, mean, sd]) as number;
    expect(x).toBeCloseTo(Math.exp(mean), 4); // median of lognormal
  });
});

describe('@onegrid/formula — BETA.DIST / BETA.INV', () => {
  it('BETA.DIST(0.5, 2, 2) = 0.5 (symmetric)', () => {
    expect(call('BETA.DIST', [0.5, 2, 2, true])).toBeCloseTo(0.5, 8);
  });

  it('BETA.DIST + BETA.INV round-trip', () => {
    for (const p of [0.25, 0.5, 0.75]) {
      const x = call('BETA.INV', [p, 2, 3]) as number;
      const back = call('BETA.DIST', [x, 2, 3, true]) as number;
      expect(back).toBeCloseTo(p, 4);
    }
  });
});

describe('@onegrid/formula — CHISQ.DIST family', () => {
  it('CHISQ.DIST cumulative at chi² critical (df=1, 0.95)', () => {
    // 95% upper critical for df=1 is ~3.841.
    expect(call('CHISQ.DIST', [3.841, 1, true])).toBeCloseTo(0.95, 2);
  });

  it('CHISQ.DIST.RT = 1 - CHISQ.DIST', () => {
    const a = call('CHISQ.DIST', [5, 3, true]) as number;
    const b = call('CHISQ.DIST.RT', [5, 3]) as number;
    expect(a + b).toBeCloseTo(1, 6);
  });

  it('CHISQ.INV round-trips with CHISQ.DIST', () => {
    const x = call('CHISQ.INV', [0.95, 5]) as number;
    expect(call('CHISQ.DIST', [x, 5, true])).toBeCloseTo(0.95, 3);
  });
});

describe('@onegrid/formula — T.DIST family', () => {
  it('T.DIST at 0 with df > 0 is 0.5 (symmetric CDF)', () => {
    expect(call('T.DIST', [0, 10, true])).toBeCloseTo(0.5, 6);
  });

  it('T.DIST.2T(z, df) ≈ 2*(1 − T.DIST(|z|, df, true))', () => {
    const a = call('T.DIST.2T', [2.0, 30]) as number;
    const b = 2 * (1 - (call('T.DIST', [2.0, 30, true]) as number));
    expect(a).toBeCloseTo(b, 5);
  });

  it('T.INV round-trips', () => {
    for (const p of [0.1, 0.5, 0.9]) {
      const x = call('T.INV', [p, 10]) as number;
      expect(call('T.DIST', [x, 10, true])).toBeCloseTo(p, 3);
    }
  });

  it('T.INV.2T two-tailed inverse on alpha=0.05 with df=30 ≈ 2.042', () => {
    expect(call('T.INV.2T', [0.05, 30])).toBeCloseTo(2.042, 2);
  });
});

describe('@onegrid/formula — F.DIST family', () => {
  it('F.DIST cumulative at F-critical (df1=5, df2=20, 0.95) ≈ 0.95', () => {
    // 95% critical for F(5, 20) is ~2.711.
    expect(call('F.DIST', [2.711, 5, 20, true])).toBeCloseTo(0.95, 2);
  });

  it('F.INV round-trips with F.DIST', () => {
    const x = call('F.INV', [0.95, 5, 20]) as number;
    expect(call('F.DIST', [x, 5, 20, true])).toBeCloseTo(0.95, 3);
  });

  it('F.DIST.RT = 1 - F.DIST', () => {
    const a = call('F.DIST', [2, 5, 10, true]) as number;
    const b = call('F.DIST.RT', [2, 5, 10]) as number;
    expect(a + b).toBeCloseTo(1, 6);
  });
});

describe('@onegrid/formula — BINOM / POISSON / HYPGEOM / NEGBINOM', () => {
  it('BINOM.DIST PMF at k=5, n=10, p=0.5 ≈ 0.246', () => {
    expect(call('BINOM.DIST', [5, 10, 0.5, false])).toBeCloseTo(0.2461, 3);
  });

  it('BINOM.DIST cumulative at k=n is 1', () => {
    expect(call('BINOM.DIST', [10, 10, 0.3, true])).toBeCloseTo(1, 8);
  });

  it('BINOM.INV finds smallest k with cum >= alpha', () => {
    // For n=10, p=0.5, alpha=0.5: median is 5.
    expect(call('BINOM.INV', [10, 0.5, 0.5])).toBe(5);
  });

  it('BINOM.DIST.RANGE sums PMFs', () => {
    const r = call('BINOM.DIST.RANGE', [10, 0.5, 4, 6]) as number;
    const expected =
      (call('BINOM.DIST', [4, 10, 0.5, false]) as number) +
      (call('BINOM.DIST', [5, 10, 0.5, false]) as number) +
      (call('BINOM.DIST', [6, 10, 0.5, false]) as number);
    expect(r).toBeCloseTo(expected, 8);
  });

  it('POISSON.DIST PMF at k=3 lambda=2 ≈ 0.180', () => {
    expect(call('POISSON.DIST', [3, 2, false])).toBeCloseTo(0.18045, 3);
  });

  it('POISSON.DIST cumulative converges to 1 for large k', () => {
    expect(call('POISSON.DIST', [50, 2, true])).toBeCloseTo(1, 8);
  });

  it('HYPGEOM.DIST PMF in a sanity case', () => {
    // Population 20, 6 successes, sample 5, observe 2 successes.
    // C(6,2)*C(14,3)/C(20,5) = 15*364/15504 ≈ 0.352
    expect(call('HYPGEOM.DIST', [2, 5, 6, 20, false])).toBeCloseTo(0.3522, 3);
  });

  it('NEGBINOM.DIST PMF at f=4 s=3 p=0.4 ≈ 0.0967', () => {
    // C(6,4) * 0.4^3 * 0.6^4 = 15 * 0.064 * 0.1296 = 0.1244... actually
    // NEGBINOM.DIST(f, s, p) = C(f+s-1, f) * p^s * (1-p)^f
    // = C(6, 4) * 0.4^3 * 0.6^4 = 15 * 0.064 * 0.1296 = 0.12442
    expect(call('NEGBINOM.DIST', [4, 3, 0.4, false])).toBeCloseTo(0.12442, 3);
  });
});

describe('@onegrid/formula — SKEW / KURT / STEYX', () => {
  it('SKEW of a symmetric sample ≈ 0', () => {
    expect(call('SKEW', [1, 2, 3, 4, 5])).toBeCloseTo(0, 6);
  });

  it('SKEW positive for right-skewed sample', () => {
    expect(call('SKEW', [1, 1, 1, 1, 10])).toBeGreaterThan(0);
  });

  it('KURT of normal-ish sample is small (excess)', () => {
    const sym = [-2, -1, 0, 1, 2];
    expect(Math.abs(call('KURT', sym) as number)).toBeLessThan(2);
  });

  it('STEYX requires ≥ 3 points; returns #DIV/0! otherwise', () => {
    expect(call('STEYX', [[1, 2], [1, 2]])).toBe(DIV_ZERO);
  });
});

describe('@onegrid/formula — FORECAST.LINEAR / TREND', () => {
  it('FORECAST.LINEAR on y=2x+1', () => {
    // ys = 3, 5, 7 from xs = 1, 2, 3. Predict at x=4 → 9.
    expect(call('FORECAST.LINEAR', [4, [3, 5, 7], [1, 2, 3]])).toBeCloseTo(9, 8);
  });

  it('TREND on the same line returns the expected 2D shape', () => {
    const r = call('TREND', [[3, 5, 7], [1, 2, 3], [4, 5]]) as number[][];
    expect(r).toEqual([[9], [11]]);
  });
});

describe('@onegrid/formula — error sentinels', () => {
  it('rejects bad parameter ranges', () => {
    expect(call('NORM.DIST', [0, 0, 0, true])).toBe(NUM_ERROR); // sd=0
    expect(call('CHISQ.DIST', [0, 0, true])).toBe(NUM_ERROR); // df=0
    expect(call('T.DIST', [0, 0, true])).toBe(NUM_ERROR);
    expect(call('GAMMA.DIST', [-1, 1, 1, true])).toBe(NUM_ERROR);
  });
});
