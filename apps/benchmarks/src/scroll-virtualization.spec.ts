// =============================================================================
// Scroll-virtualization specs — guards against the class of bugs where
// the physical-scrollbar position maps incorrectly to the logical row
// index past the browser's CSS-height cap (~16-33 Mpx). With 10M rows
// × ~28 px row height = ~280 Mpx of logical data, the physical spacer
// must be capped (<= 16 Mpx in our code) and `scrollScale` correctly
// maps physical → logical so the LAST row is reachable.
//
// Bugs this catches:
//   - missing scroll virtualization (scrollbar bottoms out at ~1.2M rows)
//   - off-by-viewport at endpoints (last ~187 rows hidden — original bug
//     reported by user, scrollScale didn't subtract viewportHeight from
//     both numerator and denominator)
//   - scale desync mid-session (toolbar reflow recomputed scale without
//     re-deriving scrollTop, visible row counter ran backwards)
//   - physical-bottom never reaching the last logical row
// =============================================================================

import { expect, test } from '@playwright/test';
import './types';

const TARGET_NUM_ROWS = 10_000_000;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
  // Switch to the 10M preset so the virtualization path is exercised.
  await page.evaluate((n) => window.__onegrid?.setRows(n), TARGET_NUM_ROWS);
  // Generation + Grid remount takes some time at 10M.
  await page.waitForFunction(
    (target) => {
      const info = window.__onegrid?.getViewportInfo?.();
      return info != null && info.numRows === target;
    },
    TARGET_NUM_ROWS,
    { timeout: 30_000 },
  );
});

test('virtualization engages for 10M rows', async ({ page }) => {
  const info = await page.evaluate(() => window.__onegrid!.getViewportInfo!());
  expect(info.numRows).toBe(TARGET_NUM_ROWS);
  // totalHeight should be much larger than the physical spacer cap of
  // 16 Mpx; scrollScale must be > 1 to compensate.
  expect(info.totalHeight).toBeGreaterThan(16_000_000);
  expect(info.scrollScale).toBeGreaterThan(1);
});

test('scrolling to the physical bottom reaches the last logical row', async ({ page }) => {
  // Drive the host's scrollHost to its physical maximum.
  await page.evaluate(() => {
    const grid = document.querySelector('[role="grid"]') as HTMLElement | null;
    if (!grid) throw new Error('no scrollHost');
    grid.scrollTop = grid.scrollHeight;
  });
  await page.waitForTimeout(80);

  const info = await page.evaluate(() => window.__onegrid!.getViewportInfo!());
  // The last visible row should be the actual last row index. Pre-fix,
  // the scale formula didn't subtract viewportHeight from both sides
  // so the last ~187 rows were unreachable from the scrollbar.
  expect(info.lastVisibleRow).toBe(TARGET_NUM_ROWS - 1);
});

test('scrollToRow lands on the requested row within viewport', async ({ page }) => {
  // scrollToRow(N) sets logical scrollTop = fenwick.prefixSum(N).
  // After dividing by scale, the physical scrollbar lands somewhere
  // that, when multiplied back by scale, yields scrollTop ≈ prefix(N).
  for (const target of [0, 1000, 100_000, 1_000_000, 5_000_000, TARGET_NUM_ROWS - 1]) {
    await page.evaluate((t) => window.__onegrid!.scrollToRow(t), target);
    await page.waitForTimeout(60);
    const info = await page.evaluate(() => window.__onegrid!.getViewportInfo!());
    // The target row should be at or just past the top of the visible
    // window. Allow some slack for variable-height rows + overscan.
    expect(info.firstVisibleRow).toBeLessThanOrEqual(target);
    expect(info.lastVisibleRow).toBeGreaterThanOrEqual(target - 50);
  }
});

test('visible row index is monotonically non-decreasing while scrolling down', async ({ page }) => {
  // This is the regression guard for the "counts backwards" symptom —
  // when scrollScale was recomputed mid-session, the next handleScroll
  // computed delta against a stale-scale scrollTop and could yield a
  // smaller logical row index even though the physical bar was moving
  // forward.
  await page.evaluate(() => window.__onegrid!.scrollToRow(0));
  await page.waitForTimeout(50);

  const samples: number[] = [];
  const STEPS = 30;
  for (let i = 0; i < STEPS; i++) {
    await page.evaluate(() => {
      const grid = document.querySelector('[role="grid"]') as HTMLElement | null;
      if (grid) grid.scrollTop += 50_000;
    });
    await page.waitForTimeout(30);
    const first = await page.evaluate(
      () => window.__onegrid!.getViewportInfo!().firstVisibleRow,
    );
    samples.push(first);
  }

  // No sample should be less than its predecessor.
  for (let i = 1; i < samples.length; i++) {
    expect(
      samples[i],
      `firstVisibleRow regressed: step ${String(i)} returned ${String(samples[i])} after ${String(samples[i - 1])}`,
    ).toBeGreaterThanOrEqual(samples[i - 1] ?? 0);
  }
  // And the last sample should be substantially past the first —
  // otherwise the test isn't actually exercising scroll.
  expect((samples[samples.length - 1] ?? 0) - (samples[0] ?? 0)).toBeGreaterThan(10_000);
});
