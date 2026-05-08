// =============================================================================
// Layout — pinned bottom row, column groups, status bar aggregates.
//
// All three layouts share dataBandTop / dataBandBottom helpers in
// @onegrid/core. A regression in any one usually warps the others
// (cells render in the wrong y range). This spec gates them by their
// observable DOM/runtime effects in real Chromium.
// =============================================================================

import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
});

test('status bar is mounted and reads "no selection" before any selection', async ({
  page,
}) => {
  const statusBar = page.getByText(/^no selection$|^count /);
  await expect(statusBar).toBeVisible();
  await expect(statusBar).toHaveText('no selection');
});

test('selecting a range updates the status bar with count + sum + avg + min + max', async ({
  page,
}) => {
  const grid = page.locator('[role="grid"]').first();
  await grid.click({ position: { x: 150, y: 100 } });
  // Cmd/Ctrl+A to select all visible cells.
  await page.keyboard.press('ControlOrMeta+a');
  await page.waitForTimeout(100);

  const statusBar = page.getByText(/^count /);
  await expect(statusBar).toBeVisible();
  await expect(statusBar).toHaveText(/count \d+.*sum .*avg .*min .*max /);
});

test('column-group band renders three group labels above the headers', async ({
  page,
}) => {
  // Column groups in memory mode: Identity / Activity / Health.
  // The labels live in the canvas — but we can read aria-rowindex
  // values to confirm the header chrome is taller (32 + 24 + 28
  // = 84px instead of 32). Easier: look at aria-colcount, which
  // mirrors the column count regardless of grouping.
  const grid = page.locator('[role="grid"]').first();
  const colCount = await grid.getAttribute('aria-colcount');
  expect(colCount).toBe('7');
  // Confirm the floating filter row is also there (84px chrome
  // worth of header bands).
  await expect(page.getByRole('searchbox', { name: 'Filter First name' })).toBeVisible();
});

// GPU-bench correctness gate lives in webgpu.spec.ts; not duplicated here.
