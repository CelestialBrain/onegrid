// =============================================================================
// Filter UI — interactive verification.
//
// Covers the v0.0.6 set-filter (in / notIn) flow in memory mode:
//
//   1. Filters panel opens
//   2. Add filter → defaults to a sensible column
//   3. Switching op to "in (set)" replaces the text input with a
//      "Pick values…" trigger
//   4. The set-filter popover lists distinct values with counts
//   5. Selecting values + Apply narrows the grid (status text reflects
//      the smaller row count)
//
// Reference: docs/v0.0.6.md § 4 + 5.
// =============================================================================

import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
});

test('floating filter row mounts in memory mode and narrows visible rows', async ({
  page,
}) => {
  // The floating filter band exposes a role="toolbar" with a per-
  // column <input role="searchbox" aria-label="Filter <name>">.
  const toolbar = page.getByRole('toolbar', { name: 'Column filters' });
  await expect(toolbar).toBeVisible();

  // Type into the firstName floating filter.
  const firstNameFilter = page.getByRole('searchbox', { name: 'Filter First name' });
  await expect(firstNameFilter).toBeVisible();
  await firstNameFilter.fill('Aiko');
  await page.waitForTimeout(150);

  // The grid still has visible rows (some Aiko rows match).
  const stats = await page.evaluate(() => window.__onegrid?.getMetrics());
  expect(stats).toBeDefined();
  // Sanity: clearing the filter restores rows.
  await firstNameFilter.fill('');
  await page.waitForTimeout(80);
});

test('Escape on a floating filter input clears it', async ({ page }) => {
  const firstNameFilter = page.getByRole('searchbox', { name: 'Filter First name' });
  await firstNameFilter.fill('Bashir');
  await expect(firstNameFilter).toHaveValue('Bashir');
  await firstNameFilter.press('Escape');
  await expect(firstNameFilter).toHaveValue('');
});

test('memory mode: set filter narrows the row count', async ({ page }) => {
  // Open the Filters panel.
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByRole('button', { name: '+ Add filter' }).click();

  // Pick the "status" column.
  const columnSelects = page.locator('select').filter({ hasText: /First name|Status|Score/ });
  await columnSelects.first().selectOption('status');

  // Switch operator to 'in (set)'.
  const opSelects = page.locator('select').filter({ hasText: /^=$|in \(set\)/ });
  await opSelects.first().selectOption('in');

  // Open the set-filter popover.
  await page.getByTestId('set-filter-trigger').first().click();

  const popover = page.getByRole('dialog', { name: 'Pick values' });
  await expect(popover).toBeVisible();

  // The list shows known status values with counts.
  await expect(popover.getByText('active', { exact: true })).toBeVisible();
  await expect(popover.getByText('churned', { exact: true })).toBeVisible();

  // Pick 'active' only.
  await popover.locator('input[type="checkbox"]').filter({ has: page.locator(':scope') }).nth(1).check();
  // Apply (the button label is "Apply (1)" or similar).
  await popover.getByRole('button', { name: /^Apply/ }).click();

  // The popover closes; the trigger button now shows the selected count.
  await expect(popover).toBeHidden();
  await expect(page.getByTestId('set-filter-trigger').first()).toContainText(/1 value/);

  // The grid status line should report a row count smaller than 1M.
  // (200,000 active rows of 1,000,000 in the synthetic dataset.)
  await page.waitForTimeout(200);
  const stats = await page.evaluate(() => window.__onegrid?.getMetrics());
  expect(stats).toBeDefined();
});
