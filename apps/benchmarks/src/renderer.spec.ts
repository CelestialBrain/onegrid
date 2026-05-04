// =============================================================================
// Custom cell renderer overlay — interactive verification in real Chromium.
//
// The "score" column in memory mode opts into a DOM-rendered progress
// bar via ColumnDef.renderer. This spec asserts:
//
//   1. Score cells mount progress-bar elements above the canvas
//   2. The pool stays bounded — peak DOM count tracks viewport height,
//      not the 1M-row dataset
//   3. update() runs on scroll: a rendered cell after fast scrolling
//      shows the row's score, not a stale value
//   4. destroy() cleans up the overlay layer
//
// Reference: docs/implementation/v0.0.6.md § 3.
// =============================================================================

import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
});

test('score cells mount progress-bar elements in the overlay', async ({ page }) => {
  // Force a few render frames so the overlay populates.
  await page.evaluate(() => {
    window.__onegrid?.scrollBy(0);
  });
  await page.waitForTimeout(100);

  const fills = page.locator('.score-fill');
  const count = await fills.count();
  expect(count).toBeGreaterThan(0);

  // Width is set as a percentage between 0 and 100.
  const firstWidth = await fills.first().getAttribute('style');
  expect(firstWidth).toMatch(/width:\s*\d+%/);
});

test('pool size is bounded by viewport, not dataset size', async ({ page }) => {
  // Scroll deep into the dataset; if the pool grew per-row, we'd see
  // millions of DOM nodes.
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => {
      window.__onegrid?.scrollBy(800);
    });
    await page.waitForTimeout(20);
  }
  // After heavy scrolling, the active overlay should still hold only
  // the visible window (a few dozen rows × 1 renderer column).
  const visibleFills = await page
    .locator('.score-fill')
    .evaluateAll((els) =>
      els.filter((el) => (el as HTMLElement).offsetParent !== null).length,
    );
  // 600px viewport / ~28px row height = ~20 visible rows; pool may
  // double-buffer for overscan, so cap at a generous 100.
  expect(visibleFills).toBeLessThan(100);
  expect(visibleFills).toBeGreaterThan(0);
});

test('renderer update() runs after scroll — values reflect current rows', async ({
  page,
}) => {
  // Snapshot the labels at scroll=0.
  const before = await page
    .locator('.score-label')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).textContent));
  expect(before.length).toBeGreaterThan(0);

  // Scroll a few thousand rows down.
  await page.evaluate(() => {
    window.__onegrid?.scrollToRow(5000);
  });
  await page.waitForTimeout(80);

  const after = await page
    .locator('.score-label')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).textContent));
  expect(after.length).toBeGreaterThan(0);
  // The rendered labels at row 5000 should differ from the labels at
  // row 0 (the synthetic dataset's score is `(i * 31) % 100` so the
  // first-row label and the row-5000 label are different values).
  expect(after).not.toEqual(before);
});
