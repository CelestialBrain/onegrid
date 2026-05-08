// =============================================================================
// Sticky group rows — real-Chromium gate.
//
// When the user scrolls a grouped grid down past a group's title row,
// that title is repainted at the top of the data band so the user
// keeps "what group am I in" context. The Grid renders the sticky
// band on the canvas (not DOM), so this spec verifies the *pixel* at
// the expected sticky y-coordinate matches the group-row background
// color (#1b1f26) — and that without grouping (or before scrolling),
// that same pixel is the default theme background (#0b0d10).
//
// Reference: ROADMAP.md v0.0.7 item 7.
// =============================================================================

import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
});

async function readPixelHex(
  page: import('@playwright/test').Page,
  yOffsetFromDataTop: number,
): Promise<string> {
  return page.evaluate(({ yOffset }) => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const sb = document.querySelector(
      'input[placeholder="First name"]',
    ) as HTMLElement;
    const cr = canvas.getBoundingClientRect();
    const dataTopCanvas = sb.getBoundingClientRect().bottom - cr.top;
    const px = ctx.getImageData(
      20 * dpr,
      (dataTopCanvas + yOffset) * dpr,
      1,
      1,
    ).data;
    return (
      '#' +
      Array.from(px.slice(0, 3))
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')
    );
  }, { yOffset: yOffsetFromDataTop });
}

test('sticky group row appears once the parent group has scrolled past', async ({
  page,
}) => {
  // Group by status — 5 collapsed groups.
  await page.locator('select').filter({ hasText: 'status' }).selectOption('status');

  // Expand the first ("active") group: click chevron at row 0.
  await page.evaluate(async () => {
    const sh = document.querySelector('div[role="grid"]') as HTMLElement;
    const sb = document.querySelector(
      'input[placeholder="First name"]',
    ) as HTMLElement;
    const dataTopAbs = sb.getBoundingClientRect().bottom;
    const x = sh.getBoundingClientRect().left + 12;
    const y = dataTopAbs + 14;
    const mk = (type: string, buttons: number): PointerEvent =>
      new PointerEvent(type, {
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons,
        pointerType: 'mouse',
        pointerId: 1,
        isPrimary: true,
      });
    sh.dispatchEvent(mk('pointerdown', 1));
    window.dispatchEvent(mk('pointerup', 0));
    await new Promise((r) => setTimeout(r, 200));
  });
  await expect.poll(async () =>
    Number(await page.locator('div[role="grid"]').first().getAttribute('aria-rowcount')),
  ).toBeGreaterThan(100);

  // Before scrolling, the topmost row IS the group row, so no sticky
  // is drawn — the pixel just below the floating-filter band shows
  // the group bg color directly (since the active group row IS at
  // the top of the data band). After scrolling 600px, the active
  // group row has moved out of view and the sticky band renders the
  // group bg at the data-top position.

  await page.evaluate(() => {
    (document.querySelector('div[role="grid"]') as HTMLElement).scrollTop = 600;
  });
  // Wait one render-frame for the canvas to repaint.
  await page.waitForTimeout(300);

  const hex = await readPixelHex(page, 5);
  // Group-row background is #1b1f26 (theme.headerBackground tinted).
  expect(hex).toBe('#1b1f26');
});

test('without grouping, no sticky band is drawn', async ({ page }) => {
  // Group by stays "none". Scroll the flat grid down.
  await page.evaluate(() => {
    (document.querySelector('div[role="grid"]') as HTMLElement).scrollTop = 600;
  });
  await page.waitForTimeout(300);

  const hex = await readPixelHex(page, 5);
  // Default body background — no sticky band overlaid.
  expect(hex).not.toBe('#1b1f26');
});
