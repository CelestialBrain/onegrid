// =============================================================================
// Scroll-math — pure functions for the virtualization scale mapping
// between the physical browser scrollbar and the logical data layout.
//
// Why these are separate from Grid: extracting the math makes it
// (a) directly fuzz-testable without instantiating a DOM Grid, and
// (b) reusable by any future consumer that needs to project an
// unbounded logical range onto a CSS-height-capped physical scrollbar.
//
// The scale formula is what today's session debugged through three
// commits. Encoding the invariants as fuzz-tested properties is the
// regression guard.
// =============================================================================

/**
 * Hard cap on the physical CSS height of a scroll spacer. Browsers
 * cap rendered element heights (Firefox ~17.9 Mpx, Chrome ~33.5 Mpx,
 * mobile Safari lower). 16 Mpx is the conservative cross-browser
 * figure — under every observed cap so the spacer is fully reachable.
 */
export const VIRTUAL_SCROLL_CAP_PX = 16_000_000;

/**
 * Compute the virtualization scale that maps physical scrollbar
 * range to the logical data layout.
 *
 *   logicalScrollTop = physicalScrollTop × scale
 *
 * Endpoints align: physical 0 → logical 0, physical max → logical max.
 * Both sides subtract viewport so the scrollbar's *scrollable* range
 * (scrollHeight - clientHeight) maps onto the *scrollable* range of
 * the data (logicalTotal - viewportHeight). Without subtracting
 * viewport from both, the bottom of the scrollbar would translate to
 * a logical position ~`viewport × scale` short of the true end —
 * exactly the off-by-187-rows bug from this session.
 *
 * @param logicalTotal — full content height including header / pinned
 *   bands AND the data Fenwick total.
 * @param viewportHeight — the host's clientHeight (the visible window).
 * @param physicalCap — the spacer's *actual rendered* height (read
 *   back via offsetHeight; browsers may clamp below the requested
 *   value, e.g. Safari).
 * @returns scale ≥ 1. Returns 1 when `logicalTotal ≤ physicalCap`
 *   (virtualization not needed).
 */
export function computeScrollScale(
  logicalTotal: number,
  viewportHeight: number,
  physicalCap: number,
): number {
  if (logicalTotal <= physicalCap) return 1;
  const vp = Math.max(1, viewportHeight);
  const physMax = Math.max(1, physicalCap - vp);
  const logMax = Math.max(1, logicalTotal - vp);
  return logMax / physMax;
}

/**
 * Project a physical scroll position (from the browser scrollbar) to
 * the logical scrollTop used by the renderer + Fenwick lookups.
 */
export function physicalToLogical(physical: number, scale: number): number {
  return physical * scale;
}

/**
 * Inverse of physicalToLogical. Used by setLogicalScrollTop when we
 * imperatively drive the scrollbar (scrollToRow, scrollBy, Home/End).
 */
export function logicalToPhysical(logical: number, scale: number): number {
  return logical / scale;
}
