// =============================================================================
// Tooltip system — interactive verification.
//
// The "updatedAt" column has a tooltip provider. This spec asserts:
//
//   1. Hovering an updatedAt cell shows a role="tooltip" after delay
//   2. Tooltip content is what the provider returned
//   3. Pointer-leave hides the tooltip
//   4. Escape dismisses (WCAG 1.4.13 dismissable requirement)
//   5. Scroll dismisses (anchored content with no anchor is nonsense)
//
// Reference: docs/implementation/v0.0.6.md § 6.
// =============================================================================

import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
});

test('hovering a cell with a tooltip provider shows role=tooltip after delay', async ({
  page,
}) => {
  // Column widths: rowIndex 80, firstName 130, lastName 150, revenue
  // 130, status 110, score 110, updatedAt 170. Cumulative end of
  // updatedAt: 880. Hovering at x=830 lands inside updatedAt.
  const grid = page.locator('[role="grid"]').first();
  await grid.hover({ position: { x: 830, y: 100 } });
  // Wait past the 500ms hover delay.
  await page.waitForTimeout(700);

  const tip = page.locator('[role="tooltip"]');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText(/Row \d+ · last updated/);
});

test('moving away from the hovered cell hides the tooltip', async ({ page }) => {
  const grid = page.locator('[role="grid"]').first();
  await grid.hover({ position: { x: 830, y: 100 } });
  await page.waitForTimeout(700);
  await expect(page.locator('[role="tooltip"]')).toBeVisible();

  // Move to a non-tooltip column. Hovering over a column with a
  // custom renderer (status, score) would have its pointer events
  // intercepted by the rendered DOM (intentional for interactive
  // widgets), so target the firstName column at x=150 which is plain
  // canvas text.
  await grid.hover({ position: { x: 150, y: 100 } });
  await page.waitForTimeout(50);
  await expect(page.locator('[role="tooltip"]')).toBeHidden();
});

test('Escape dismisses the tooltip (WCAG 1.4.13)', async ({ page }) => {
  const grid = page.locator('[role="grid"]').first();
  await grid.click({ position: { x: 830, y: 100 } });
  await grid.hover({ position: { x: 830, y: 100 } });
  await page.waitForTimeout(700);
  await expect(page.locator('[role="tooltip"]')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('[role="tooltip"]')).toBeHidden();
});

test('scrolling dismisses the tooltip', async ({ page }) => {
  const grid = page.locator('[role="grid"]').first();
  await grid.hover({ position: { x: 830, y: 100 } });
  await page.waitForTimeout(700);
  await expect(page.locator('[role="tooltip"]')).toBeVisible();

  await page.evaluate(() => {
    window.__onegrid?.scrollBy(120);
  });
  await page.waitForTimeout(50);
  await expect(page.locator('[role="tooltip"]')).toBeHidden();
});
