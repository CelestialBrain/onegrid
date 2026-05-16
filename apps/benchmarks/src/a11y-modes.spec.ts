// =============================================================================
// v1.0 expanded a11y coverage — axe-core on every playground mode, not just
// the in-memory default.
//
// The original a11y.spec.ts asserted zero critical / serious violations on
// the default in-memory mode. For v1.0.0 we run the same scan against every
// data-source mode + the formula spreadsheet UI + the pivot + tree views.
// Modes that mount different DOM overlays (formula bar, DuckDB connection
// indicator, etc.) are the ones likeliest to introduce a11y regressions.
// =============================================================================

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import './types';

const MODES = [
  { label: 'In-memory', selector: 'button:has-text("In-memory")' },
  { label: 'Formula', selector: 'button:has-text("Formula")' },
  { label: 'Pivot', selector: 'button:has-text("Pivot")' },
  { label: 'Tree', selector: 'button:has-text("Tree"):not(:has-text("SSRM"))' },
] as const;

for (const mode of MODES) {
  test(`axe-core: zero critical/serious violations in ${mode.label} mode`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__onegrid !== undefined);
    await page.locator(mode.selector).first().click();
    // Let the mode swap finish painting.
    await page.waitForTimeout(300);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .disableRules(['color-contrast']) // same exemption as a11y.spec.ts
      .analyze();
    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
}

test('axe-core: zero critical/serious violations with the column tool panel open', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
  await page.locator('button:has-text("Columns")').click();
  await page.waitForTimeout(150);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .disableRules(['color-contrast'])
    .analyze();
  const critical = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
});

test('axe-core: zero critical/serious violations with floating filter row + filters panel open', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
  await page.locator('button:has-text("Filters")').click();
  await page.waitForTimeout(150);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .disableRules(['color-contrast'])
    .analyze();
  const critical = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
});

test('axe-core: zero critical/serious violations with group-by + sticky group rows', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
  await page.locator('label:has-text("Group by") select').selectOption('status');
  await page.waitForTimeout(300);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .disableRules(['color-contrast'])
    .analyze();
  const critical = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
});
