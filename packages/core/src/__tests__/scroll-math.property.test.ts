// =============================================================================
// scroll-math — property-based tests for the virtualization scale math.
//
// Today's session debugged this through three commits because the math
// was inside Grid and not directly testable. Now that it lives in
// pure functions, every invariant is a one-line property.
//
// Invariants:
//   (S1) When logicalTotal <= physicalCap, scale === 1.
//   (S2) When logicalTotal > physicalCap, scale >= 1.
//   (S3) Endpoint round-trip — physical=0 ↔ logical=0; physical=physMax ↔
//        logical=logMax (within FP precision).
//   (S4) Monotonicity — physicalToLogical is non-decreasing in physical.
//   (S5) Inverse — for any logical y in [0, logMax],
//        physicalToLogical(logicalToPhysical(y, scale), scale) ≈ y
//        (within FP rounding tolerance scaled by `scale`).
//   (S6) Browser-clamped cap — when the requested cap is clamped
//        below the requested value, scale still maps endpoints
//        correctly relative to the *clamped* cap.
// =============================================================================

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  VIRTUAL_SCROLL_CAP_PX,
  computeScrollScale,
  logicalToPhysical,
  physicalToLogical,
} from '../scroll-math';

// Realistic ranges: 1M-100M total px, viewport 200-1600 px, cap 8M-16M.
const totalArb = fc.integer({ min: 100_000, max: 500_000_000 });
const vpArb = fc.integer({ min: 200, max: 1600 });
const capArb = fc.integer({ min: 8_000_000, max: 16_000_000 });

describe('scroll-math — properties', () => {
  it('(S1) scale === 1 when virtualization not needed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 100_000 }),
        vpArb,
        capArb,
        (total, vp, cap) => {
          // total < cap by construction here (total caps at 100K).
          expect(computeScrollScale(total, vp, cap)).toBe(1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('(S2) scale >= 1 when virtualization engages', () => {
    fc.assert(
      fc.property(totalArb, vpArb, capArb, (total, vp, cap) => {
        const scale = computeScrollScale(total, vp, cap);
        if (total > cap) {
          expect(scale).toBeGreaterThanOrEqual(1);
        } else {
          expect(scale).toBe(1);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('(S3) endpoint round-trip: physical 0 ↔ logical 0', () => {
    fc.assert(
      fc.property(totalArb, vpArb, capArb, (total, vp, cap) => {
        const scale = computeScrollScale(total, vp, cap);
        expect(physicalToLogical(0, scale)).toBe(0);
        expect(logicalToPhysical(0, scale)).toBe(0);
      }),
      { numRuns: 200 },
    );
  });

  it('(S3b) endpoint round-trip: physical max → ~logical max', () => {
    fc.assert(
      fc.property(totalArb, vpArb, capArb, (total, vp, cap) => {
        const scale = computeScrollScale(total, vp, cap);
        if (total <= cap) return; // no virtualization → both maxes are equal trivially
        const physMax = cap - vp;
        const logMax = total - vp;
        const projected = physicalToLogical(physMax, scale);
        // Should land within 1 ULP of logMax. We allow 1 px of slack to
        // tolerate float rounding.
        expect(Math.abs(projected - logMax)).toBeLessThanOrEqual(1);
      }),
      { numRuns: 500 },
    );
  });

  it('(S4) physicalToLogical is monotonic non-decreasing', () => {
    fc.assert(
      fc.property(totalArb, vpArb, capArb, (total, vp, cap) => {
        const scale = computeScrollScale(total, vp, cap);
        const physMax = total > cap ? cap - vp : total - vp;
        if (physMax <= 0) return; // degenerate viewport > content
        let prev = -Infinity;
        for (const p of [0, physMax * 0.25, physMax * 0.5, physMax * 0.75, physMax]) {
          const l = physicalToLogical(p, scale);
          expect(l).toBeGreaterThanOrEqual(prev);
          prev = l;
        }
      }),
      { numRuns: 200 },
    );
  });

  it('(S5) inverse round-trip: physToLog(logToPhys(y)) ≈ y', () => {
    fc.assert(
      fc.property(
        totalArb,
        vpArb,
        capArb,
        fc.double({ min: 0, max: 1, noNaN: true }), // fraction of logMax to test
        (total, vp, cap, frac) => {
          const scale = computeScrollScale(total, vp, cap);
          const logMax = total > cap ? total - vp : total - vp;
          if (logMax <= 0) return;
          const y = logMax * frac;
          const roundTripped = physicalToLogical(logicalToPhysical(y, scale), scale);
          // Tolerance scales with the magnitude — 1 ULP at logical y
          // is roughly y × Number.EPSILON, but we allow 1 px to keep
          // the property robust across the whole range.
          expect(Math.abs(roundTripped - y)).toBeLessThanOrEqual(Math.max(1, y * 1e-10));
        },
      ),
      { numRuns: 500 },
    );
  });

  it('(S6) browser-clamped cap: scale still endpoint-correct', () => {
    // Simulate WebKit / mobile-Safari clamping below the requested cap.
    fc.assert(
      fc.property(
        totalArb,
        vpArb,
        fc.integer({ min: 8_000_000, max: 16_000_000 }), // requested cap
        fc.double({ min: 0.5, max: 1.0, noNaN: true }), // browser clamp fraction
        (total, vp, requestedCap, clampFrac) => {
          const actualCap = Math.floor(requestedCap * clampFrac);
          const scale = computeScrollScale(total, vp, actualCap);
          if (total <= actualCap) {
            expect(scale).toBe(1);
            return;
          }
          // Endpoint should still reach near logMax. The key bug today's
          // session shipped a fix for: scrollScale must be derived from
          // the ACTUAL rendered spacer height, not the requested one.
          const physMax = actualCap - vp;
          const logMax = total - vp;
          const projected = physicalToLogical(physMax, scale);
          expect(Math.abs(projected - logMax)).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('(S7) regression: 10M rows × 28 px reaches last row at physical max', () => {
    // The specific case that broke today. Hardcoded as a sanity guard
    // alongside the parametric properties.
    const total = 10_000_000 * 28; // 280 Mpx
    const vp = 800;
    const cap = VIRTUAL_SCROLL_CAP_PX;
    const scale = computeScrollScale(total, vp, cap);
    const physMax = cap - vp;
    const logMax = total - vp;
    expect(Math.abs(physicalToLogical(physMax, scale) - logMax)).toBeLessThanOrEqual(1);
  });
});
