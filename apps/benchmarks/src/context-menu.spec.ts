// =============================================================================
// Context menu — real-Chromium gates.
//
// Asserts the v0.0.7 context-menu wiring:
//   1. Right-click on a cell → menu with 'Copy cell', 'Sort by …',
//      'Hide …' anchored at the click coordinates.
//   2. Right-click on a header → menu with 'Sort by …', 'Hide …'
//      (no 'Copy cell' for header targets).
//   3. Click outside → menu dismisses.
//   4. Press Escape → menu dismisses.
//
// The Grid only forwards the contextmenu payload — the playground
// renders its own popover. So the "menu" we look for is the React
// popover with data-onegrid-context-menu.
//
// Reference: ROADMAP.md v0.0.7 item 6.
// =============================================================================

import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
});

async function dispatchContextMenu(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
): Promise<void> {
  await page.evaluate(
    ({ clickX, clickY }) => {
      const sh = document.querySelector('div[role="grid"]') as HTMLElement;
      const hr = (sh.parentElement as HTMLElement).getBoundingClientRect();
      sh.dispatchEvent(
        new PointerEvent('contextmenu', {
          clientX: hr.left + clickX,
          clientY: hr.top + clickY,
          bubbles: true,
          cancelable: true,
          button: 2,
          pointerType: 'mouse',
          pointerId: 1,
          isPrimary: true,
        }),
      );
    },
    { clickX: x, clickY: y },
  );
}

test('right-click on a cell shows a contextual menu', async ({ page }) => {
  // Header(32) + filter band(28) = 60; row 2 mid ≈ 130. Last-name column
  // mid ≈ 290 (frozen # 80 + First 130 = 210; Last 150 → mid 285).
  await dispatchContextMenu(page, 290, 130);

  const menu = page.locator('[data-onegrid-context-menu]');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Copy cell' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /^Sort by/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /^Hide/ })).toBeVisible();
});

test('right-click on a header omits Copy cell', async ({ page }) => {
  await dispatchContextMenu(page, 545, 16); // y=16 → header band

  const menu = page.locator('[data-onegrid-context-menu]');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Copy cell' })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: /^Sort by/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /^Hide/ })).toBeVisible();
});

test('Escape dismisses the menu', async ({ page }) => {
  await dispatchContextMenu(page, 290, 130);
  await expect(page.locator('[data-onegrid-context-menu]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-onegrid-context-menu]')).toHaveCount(0);
});

test('clicking outside dismisses the menu', async ({ page }) => {
  await dispatchContextMenu(page, 290, 130);
  await expect(page.locator('[data-onegrid-context-menu]')).toBeVisible();
  // Click the page background far from the menu — h1 is in the toolbar.
  await page.locator('h1').click();
  await expect(page.locator('[data-onegrid-context-menu]')).toHaveCount(0);
});
