// =============================================================================
// v1.2 column drag-to-resize — real-Chromium verification.
// =============================================================================

import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
  await page.evaluate(() => {
    window.__onegrid?.scrollBy(0);
  });
  await page.waitForTimeout(100);
});

test('drag the right edge of a column header to make it wider', async ({ page }) => {
  const probe = await page.evaluate(() => {
    const grid = window.__onegrid!;
    const host = grid.host!;
    const rect = host.getBoundingClientRect();
    const cols = grid.getColumns!();
    const targetIdx = cols.findIndex((c) => c.id === 'firstName');
    const idx = targetIdx >= 0 ? targetIdx : 1;
    const target = cols[idx];
    let x = rect.left;
    for (let i = 0; i <= idx; i++) x += cols[i]!.width;
    return {
      id: target.id,
      width: target.width,
      boundaryX: x,
      hostLeft: rect.left,
      hostTop: rect.top,
      cols: cols.map((c) => ({ id: c.id, width: c.width })),
    };
  });
  const startX = probe.boundaryX - 3;
  const startY = probe.hostTop + 16;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(startX + (80 * i) / 8, startY);
    await page.waitForTimeout(15);
  }
  await page.mouse.up();
  await page.waitForTimeout(100);

  const afterWidth = await page.evaluate((id) => {
    return window.__onegrid!.getColumns!().find((c) => c.id === id)?.width ?? -1;
  }, probe.id);
  expect(afterWidth).toBeGreaterThan(probe.width + 60);
  expect(afterWidth).toBeLessThan(probe.width + 100);
});

test('drag the right edge to make a column narrower', async ({ page }) => {
  const probe = await page.evaluate(() => {
    const grid = window.__onegrid!;
    const host = grid.host!;
    const rect = host.getBoundingClientRect();
    const cols = grid.getColumns!();
    const targetIdx = cols.findIndex((c) => c.id === 'revenue');
    const idx = targetIdx >= 0 ? targetIdx : 2;
    const target = cols[idx];
    let x = rect.left;
    for (let i = 0; i <= idx; i++) x += cols[i]!.width;
    return { id: target.id, width: target.width, boundaryX: x, hostTop: rect.top };
  });

  const startX = probe.boundaryX - 3;
  const startY = probe.hostTop + 16;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(startX - (40 * i) / 8, startY);
    await page.waitForTimeout(15);
  }
  await page.mouse.up();
  await page.waitForTimeout(100);

  const afterWidth = await page.evaluate((id) => {
    return window.__onegrid!.getColumns!().find((c) => c.id === id)?.width ?? -1;
  }, probe.id);
  expect(afterWidth).toBeLessThan(probe.width - 20);
  expect(afterWidth).toBeGreaterThanOrEqual(24);
});

test('clicking the middle of a header (not the resize zone) leaves width unchanged', async ({
  page,
}) => {
  const probe = await page.evaluate(() => {
    const grid = window.__onegrid!;
    const host = grid.host!;
    const rect = host.getBoundingClientRect();
    const cols = grid.getColumns!();
    const targetIdx = cols.findIndex((c) => c.id === 'firstName');
    const idx = targetIdx >= 0 ? targetIdx : 1;
    const target = cols[idx];
    let x = rect.left;
    for (let i = 0; i < idx; i++) x += cols[i]!.width;
    return {
      id: target.id,
      width: target.width,
      midX: x + target.width / 2,
      midY: rect.top + 16,
    };
  });
  await page.mouse.click(probe.midX, probe.midY);
  await page.waitForTimeout(50);
  const afterWidth = await page.evaluate((id) => {
    return window.__onegrid!.getColumns!().find((c) => c.id === id)?.width ?? -1;
  }, probe.id);
  expect(Math.abs(afterWidth - probe.width)).toBeLessThan(2);
});
