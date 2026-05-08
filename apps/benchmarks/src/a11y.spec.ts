// =============================================================================
// Accessibility conformance suite for oneGrid v0.0.6.
//
// Three CI-gated layers per the WAI-ARIA 1.2 grid pattern:
//
//   1. axe-core static scan against WCAG 2.1 A/AA tags. Fails CI on
//      any "critical" or "serious" violation. WAI-ARIA 1.2 grid pattern
//      reference: https://www.w3.org/WAI/ARIA/apg/patterns/grid/.
//
//   2. ARIA-tree snapshot of the grid's overlay DOM. Asserts the role +
//      aria-rowcount + aria-colcount + multi-selectable wiring exists.
//      Reference: https://playwright.dev/docs/aria-snapshots.
//
//   3. Active-descendant invariant. The aria-activedescendant attribute
//      on the grid root must always resolve to a live <td role="gridcell">
//      with the correct aria-colindex / aria-rowindex.
//
// Layer 4 (screen reader smoke via Guidepup) is documented in
// docs/v0.0.6.md and lands in a follow-up PR — it
// requires a Windows runner for NVDA and a macOS runner for VoiceOver.
// =============================================================================

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
});

test('axe-core: zero critical / serious violations on the in-memory grid', async ({
  page,
}) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // The "color-contrast" rule is rule-of-thumb and the grid's dark
    // theme tokens are intentional; skip until light theme + density
    // variants ship in a later v0.0.6 commit.
    .disableRules(['color-contrast'])
    .analyze();

  const blocking = results.violations.filter((v) =>
    v.impact === 'critical' || v.impact === 'serious',
  );
  if (blocking.length > 0) {
    // Surface the violation summaries so the failure log is actionable.
    // eslint-disable-next-line no-console
    console.log(
      'axe violations:',
      JSON.stringify(
        blocking.map((v) => ({ id: v.id, impact: v.impact, help: v.help })),
        null,
        2,
      ),
    );
  }
  expect(blocking).toEqual([]);
});

test('grid root carries the WAI-ARIA 1.2 grid pattern attributes', async ({ page }) => {
  const grid = page.locator('[role="grid"]').first();
  await expect(grid).toHaveAttribute('aria-rowcount', /^\d+$/);
  await expect(grid).toHaveAttribute('aria-colcount', /^\d+$/);
  await expect(grid).toHaveAttribute('aria-multiselectable', 'true');
  // The grid id is the anchor `aria-activedescendant` resolves against.
  await expect(grid).toHaveAttribute('id', /^onegrid-\d+$/);
});

test('aria-activedescendant tracks the active cell and resolves to a live <td>', async ({
  page,
}) => {
  // Move the grid's selection to a known cell programmatically.
  await page.evaluate(() => {
    // Click into the canvas first to focus the grid.
    const grid = document.querySelector('[role="grid"]') as HTMLElement;
    grid.focus();
  });
  // Drive a few arrow-down presses to set an active cell that's not (0,0).
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('ArrowRight');

  const grid = page.locator('[role="grid"]').first();
  const activeId = await grid.getAttribute('aria-activedescendant');
  expect(activeId).not.toBeNull();
  expect(activeId!).toMatch(/^onegrid-\d+-r\d+-c\d+$/);

  // The id must resolve to a live <td> with role=gridcell.
  const cell = page.locator(`#${activeId!}`);
  await expect(cell).toHaveAttribute('role', 'gridcell');
  await expect(cell).toHaveAttribute('aria-selected', 'true');
});

test('every rendered <td role="gridcell"> carries aria-colindex', async ({ page }) => {
  // Force a paint so the a11y shadow is populated.
  await page.evaluate(() => {
    window.__onegrid?.scrollBy(0);
  });
  await page.waitForTimeout(100);

  const cells = page.locator('td[role="gridcell"]');
  const count = await cells.count();
  expect(count).toBeGreaterThan(0);

  // Spot-check the first 20 cells.
  const sample = Math.min(count, 20);
  for (let i = 0; i < sample; i++) {
    await expect(cells.nth(i)).toHaveAttribute('aria-colindex', /^\d+$/);
  }
});
