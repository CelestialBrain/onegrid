// =============================================================================
// Row grouping with aggregations — real-browser gates.
//
// The playground's memory mode exposes a "Group by" dropdown that flips
// the row source through a flattened group tree (group header rows +
// leaf rows). Each group header carries an aggregate revenue/score
// from @onegrid/data's groupRows + aggregations.
// =============================================================================

import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
});

test('Group by status reduces aria-rowcount to 5 collapsed group headers', async ({
  page,
}) => {
  const grid = page.locator('[role="grid"]').first();
  await page.getByLabel('Group by').selectOption('status');
  await expect(grid).toHaveAttribute('aria-rowcount', '5', { timeout: 5_000 });
});

test('clicking a group chevron expands and grows aria-rowcount', async ({ page }) => {
  const grid = page.locator('[role="grid"]').first();
  await page.getByLabel('Group by').selectOption('status');
  await expect(grid).toHaveAttribute('aria-rowcount', '5', { timeout: 5_000 });

  // Group row 0 is the first depth-0 group. Chevron hit zone is
  // depth*16 + [4, 4+24]. Click at x=12, y=100 (inside row 0).
  await grid.click({ position: { x: 12, y: 100 } });
  // After expanding any group, total row count goes up by the number
  // of children in that group (~200k for 1M-row dataset).
  await expect
    .poll(
      async () => Number((await grid.getAttribute('aria-rowcount')) ?? '0'),
      { timeout: 5_000 },
    )
    .toBeGreaterThan(5);
});

test('changing Group by back to none restores the flat dataset', async ({ page }) => {
  await page.getByLabel('Group by').selectOption('status');
  await page.waitForTimeout(100);
  await page.getByLabel('Group by').selectOption('none');
  await page.waitForTimeout(100);
  // Back to 1M rows.
  const grid = page.locator('[role="grid"]').first();
  const rowCount = await grid.getAttribute('aria-rowcount');
  expect(Number(rowCount!)).toBeGreaterThan(900_000);
});
