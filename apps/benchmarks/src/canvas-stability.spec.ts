// =============================================================================
// Canvas-stability specs — regression guards against the class of bugs
// where assigning to canvas.width / .height clears the canvas to
// transparent and the redraw lands a frame later, producing a visible
// flicker. Today's session shipped fixes for:
//
//   - drag column resize (handleResize was reassigning canvas.width on
//     every host-resize tick triggered by toolbar reflow)
//   - window resize (canvas was being reallocated then redraw was
//     queued for next rAF, so the browser painted the blank canvas in
//     between)
//
// Both bugs were originally diagnosed by attaching a MutationObserver
// to the canvas in the live playground and sampling pixels via
// getImageData. That diagnostic is now formalized in
// `assertCanvasStable` — these specs guarantee the bugs don't return.
// =============================================================================

import { expect, test } from '@playwright/test';
import { assertCanvasStable } from './canvas-stability';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
  // Settle the initial paint so we don't catch first-frame churn.
  await page.waitForTimeout(150);
});

test('window resize never paints a blank canvas', async ({ page }) => {
  const verdict = await assertCanvasStable(page, 'window resize', async () => {
    // Walk the viewport through a sequence of sizes. Each setViewportSize
    // triggers a ResizeObserver fire which calls handleResize. Pre-fix,
    // canvas.width was reassigned and the redraw was deferred to rAF —
    // any one of these steps would leave a blank-frame artifact.
    for (const w of [1200, 1100, 1300, 1000, 1440]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.waitForTimeout(40);
    }
  });

  expect(
    verdict.blankFramesObserved,
    `canvas was observably blank ${String(verdict.blankFramesObserved)} time(s) during window resize (${String(verdict.mutationCount)} mutations total)`,
  ).toBe(0);
  // Sanity check: the resizes did actually trigger canvas mutations.
  // If this is zero, the test isn't exercising the fix path.
  expect(verdict.mutationCount).toBeGreaterThan(0);
});

test('column drag-resize never paints a blank canvas', async ({ page }) => {
  // Find a non-frozen column we can resize. Default playground starts
  // in memory mode with rowIndex / firstName / lastName / revenue ...
  const probe = await page.evaluate(() => {
    const grid = window.__onegrid!;
    const host = grid.host!;
    const rect = host.getBoundingClientRect();
    const cols = grid.getColumns!();
    // Target firstName (index 1) — definitely past the frozen band.
    const idx = cols.findIndex((c) => c.id === 'firstName');
    let x = rect.left;
    for (let i = 0; i <= idx; i++) x += cols[i]!.width;
    return { boundaryX: x, hostTop: rect.top };
  });

  const verdict = await assertCanvasStable(page, 'column drag-resize', async () => {
    const startX = probe.boundaryX - 3;
    const startY = probe.hostTop + 16;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let i = 1; i <= 16; i++) {
      await page.mouse.move(startX + i * 8, startY);
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
  });

  expect(
    verdict.blankFramesObserved,
    `canvas blanked ${String(verdict.blankFramesObserved)} time(s) during drag (${String(verdict.mutationCount)} mutations)`,
  ).toBe(0);
});

test('scroll never paints a blank canvas', async ({ page }) => {
  // Scrolling doesn't reassign canvas.width — but if a regression
  // ever introduces that, this catches it.
  const verdict = await assertCanvasStable(page, 'scroll', async () => {
    for (let i = 0; i < 10; i++) {
      await page.evaluate((dy) => window.__onegrid?.scrollBy(dy), 500);
      await page.waitForTimeout(20);
    }
  });

  expect(verdict.blankFramesObserved).toBe(0);
});
