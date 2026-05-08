// =============================================================================
// Column tool panel — real-Chromium gates.
//
// Asserts the v0.0.7 ColumnToolPanel behaviour against the playground:
//   1. Clicking the "Columns" toolbar button opens a sidebar with one
//      checkbox per column.
//   2. Unchecking a column hides it from the live grid (the column's
//      <th> is gone from the ARIA shadow).
//   3. Re-checking restores the column.
//
// The panel is a React component in @onegrid/react that calls
// grid.setColumns() with the visible subset on every toggle. It does
// NOT remount the Grid — selection / scroll / sort survive across
// visibility changes.
//
// Reference: ROADMAP.md v0.0.7 item 5.
// =============================================================================

import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
});

async function readHeaderOrder(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('table[role="grid"] thead th'))
      .map((t) => (t.textContent ?? '').trim())
      .filter((t) => t.length > 0),
  );
}

test('clicking Columns opens the panel with one entry per column', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  // Panel renders an aria-list of toggleable column entries; one
  // checkbox per column in the live grid (memory mode = 7 columns).
  await expect.poll(
    async () =>
      page.evaluate(() =>
        document.querySelectorAll('input[type="checkbox"][aria-label^="Toggle "]').length,
      ),
  ).toBe(7);
});

test('unchecking a column hides it from the grid', async ({ page }) => {
  const before = await readHeaderOrder(page);
  expect(before).toContain('First name');

  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'Toggle First name visibility' })
    .uncheck();

  await expect.poll(async () => readHeaderOrder(page)).not.toContain('First name');
});

test('rechecking a hidden column restores it', async ({ page }) => {
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  const checkbox = page.getByRole('checkbox', {
    name: 'Toggle First name visibility',
  });
  await checkbox.uncheck();
  await expect.poll(async () => readHeaderOrder(page)).not.toContain('First name');

  await checkbox.check();
  await expect.poll(async () => readHeaderOrder(page)).toContain('First name');
});
