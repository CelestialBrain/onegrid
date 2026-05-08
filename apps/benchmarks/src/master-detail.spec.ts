// =============================================================================
// Master-detail expandable rows — real-browser gates.
//
// The chevron column lives in the leftmost 24px of every row; clicking
// it toggles expansion. The detail panel is mounted by the playground
// as a DOM child of the grid's detail layer with its own table of
// row data + a hint footer.
// =============================================================================

import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
});

test('clicking the chevron expands a row and renders a detail panel', async ({
  page,
}) => {
  // Chevron lives at the leftmost 24px of the data band. Header + group
  // band + filter row = 32 + 24 + 28 = 84px. Row 0 starts there.
  const grid = page.locator('[role="grid"]').first();
  await grid.click({ position: { x: 8, y: 100 } });

  // Detail panels mount as absolutely-positioned DOM children
  // containing the playground's "master-detail panel" header.
  await expect(page.getByText('master-detail panel')).toBeVisible({ timeout: 2_000 });
  // The hint footer about real DOM children is also rendered.
  await expect(
    page.getByText(/real DOM child of the Grid/),
  ).toBeVisible();
});

test('clicking the chevron a second time collapses the row', async ({ page }) => {
  const grid = page.locator('[role="grid"]').first();
  await grid.click({ position: { x: 8, y: 100 } });
  await expect(page.getByText('master-detail panel')).toBeVisible();

  await grid.click({ position: { x: 8, y: 100 } });
  // After collapse, the panel is unmounted from the detail layer.
  await expect(page.getByText('master-detail panel')).toBeHidden();
});

test('expanding multiple rows mounts a panel per row', async ({ page }) => {
  // Row 0 chevron at (8, 100). After expansion, row 0's detail panel
  // occupies +200px below the row, so the next row pushes to y ≈ 320+.
  // Click at y=420 to safely hit a row that is NOT overlapping the
  // first detail panel.
  const grid = page.locator('[role="grid"]').first();
  await grid.click({ position: { x: 8, y: 100 } });
  await expect(page.getByText('master-detail panel')).toHaveCount(1);
  await grid.click({ position: { x: 8, y: 420 } });
  await expect(page.getByText('master-detail panel')).toHaveCount(2, {
    timeout: 2_000,
  });
});
