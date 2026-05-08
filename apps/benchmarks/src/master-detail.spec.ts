// =============================================================================
// Master-detail expandable rows + nested grids — real-browser gates.
//
// The chevron column lives in the leftmost 24px of every row; clicking
// it toggles expansion. The detail panel is mounted by the playground
// as a DOM child of the grid's detail layer and hosts a *nested* Grid
// instance showing 10 synthetic audit-log rows. Each inner Grid has its
// own canvas, scrollHost, and ARIA shadow, so the page ends up with two
// distinct `[role="grid"]` elements while expanded. Collapse must call
// the inner Grid's destroy() via onDetailUnmount so the count returns
// to 1.
//
// Reference: ROADMAP.md v0.0.7 item 2.
// =============================================================================

import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
});

test('clicking the chevron expands a row and mounts a nested grid', async ({
  page,
}) => {
  // Header (32) + floating-filter band (28) ≈ 84 host-relative. Row 0
  // starts there with height 28 → click at (8, 98) hits row 0's
  // chevron. y must be ≥ 88 to clear the floating filter <input> nodes
  // that intercept events.
  const grid = page.locator('div[role="grid"]').first();

  await grid.click({ position: { x: 8, y: 98 } });

  // Detail panel mounts a real Grid → page now has 2 [role="grid"] hosts.
  await expect(page.locator('div[role="grid"]')).toHaveCount(2, { timeout: 2_000 });
  // The detail title from the playground is rendered above the inner grid.
  await expect(page.getByText(/audit log \(nested grid\)/)).toBeVisible();
});

test('collapsing destroys the nested grid', async ({ page }) => {
  const grid = page.locator('div[role="grid"]').first();

  await grid.click({ position: { x: 8, y: 98 } });
  await expect(page.locator('div[role="grid"]')).toHaveCount(2);

  await grid.click({ position: { x: 8, y: 98 } });
  // After collapse, onDetailUnmount → inner.destroy() → exactly 1 grid.
  await expect(page.locator('div[role="grid"]')).toHaveCount(1, { timeout: 2_000 });
});

test('expanding multiple rows mounts a separate nested grid per row', async ({
  page,
}) => {
  // Row 0 chevron at (8, 98). After expansion, row 0's detail panel
  // occupies +200px below the row, so the next row sits below the
  // panel. Click at y=410 to safely hit a row that is NOT overlapping
  // the first detail panel.
  const grid = page.locator('div[role="grid"]').first();

  await grid.click({ position: { x: 8, y: 98 } });
  await expect(page.locator('div[role="grid"]')).toHaveCount(2);
  await grid.click({ position: { x: 8, y: 420 } });
  // Outer + 2 inner = 3 grids.
  await expect(page.locator('div[role="grid"]')).toHaveCount(3, { timeout: 2_000 });
});
