// =============================================================================
// axe-core a11y gate — runs axe against the playground in each major
// mode and asserts zero serious/critical violations. WCAG 2.2 AA is the
// target; we expose the violations list on failure so a regression
// produces a useful diff.
//
// Why this matters: the grid's a11y shadow (off-screen <table role="grid">)
// is the only thing screen readers see. If it loses ARIA attributes
// or color contrast in the toolbar regresses, accessibility silently
// breaks. axe catches both.
// =============================================================================

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
  await page.waitForTimeout(200);
});

test('memory mode has no serious or critical a11y violations', async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  const seriousOrCritical = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    seriousOrCritical,
    seriousOrCritical
      .map((v) => `[${String(v.impact)}] ${v.id}: ${v.help}`)
      .join('\n'),
  ).toEqual([]);
});

test('formula mode has no serious or critical a11y violations', async ({ page }) => {
  await page.evaluate(() => window.__onegrid?.setMode?.('formula'));
  await page.waitForFunction(() => window.__onegrid?.getMode?.() === 'formula');
  await page.waitForTimeout(300);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  const seriousOrCritical = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    seriousOrCritical,
    seriousOrCritical
      .map((v) => `[${String(v.impact)}] ${v.id}: ${v.help}`)
      .join('\n'),
  ).toEqual([]);
});
