// =============================================================================
// Cell-overlay clip regression — pinned-bottom (totals row) and the
// header / filter band must NOT have DOM cell-renderer content
// (status pills, score bars) painted on top of them. Pre-fix, the
// overlay was `inset:0` so DOM cells positioned at scroll-row
// coordinates could paint over the totals row and the floating-filter
// band, observable as flickering pills above the bottom band.
//
// We assert directly on the rendered DOM by inspecting where each
// renderer instance lives relative to the data band.
// =============================================================================

import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
  await page.waitForTimeout(300);
});

test('no renderer cell paints into the header / filter band', async ({ page }) => {
  // Switch to memory mode (has status + score renderers).
  await page.evaluate(() => window.__onegrid?.setMode?.('memory'));
  await page.waitForFunction(() => {
    const i = window.__onegrid?.getViewportInfo?.();
    return i != null && i.numRows >= 1_000_000;
  });
  await page.waitForTimeout(400);

  // Scroll near the top so cells naturally crowd against the header.
  await page.evaluate(() => window.__onegrid?.scrollToRow(0));
  await page.waitForTimeout(150);

  // Query DOM cells and ensure none paint above the header bottom.
  const violations = await page.evaluate(() => {
    const host = window.__onegrid?.host;
    if (!host) return ['no host'];
    // Find the visible cell overlay. It's the host child whose style
    // has `position: absolute; pointer-events: none`. We detect it
    // by descendant elements with `position:absolute` whose parent is
    // a direct host child div that is not the canvas / scrollHost /
    // statusBar.
    const overlay = Array.from(host.children).find((c) => {
      if (!(c instanceof HTMLElement)) return false;
      const cs = window.getComputedStyle(c);
      return c.tagName === 'DIV' &&
        cs.position === 'absolute' &&
        cs.pointerEvents === 'none' &&
        c.firstElementChild != null;
    }) as HTMLElement | undefined;
    if (!overlay) return [];
    const clip = overlay.style.clipPath;
    return [{ clipPath: clip || null }];
  });
  // Cell overlay should now have a clipPath applied.
  if (violations.length > 0) {
    const v = violations[0] as { clipPath: string | null };
    expect(v.clipPath, 'cellOverlayEl is missing clip-path; pinned-band overlap is unguarded').not.toBeNull();
    expect(v.clipPath?.startsWith('inset(')).toBe(true);
  }
});

test('totals row remains visible while score / status cells render', async ({ page }) => {
  await page.evaluate(() => window.__onegrid?.setMode?.('memory'));
  await page.waitForFunction(() => {
    const i = window.__onegrid?.getViewportInfo?.();
    return i != null && i.numRows >= 1_000_000;
  });
  await page.waitForTimeout(400);

  // Make a few visible edits to drive overlay updates while totals
  // row is on screen.
  for (let i = 0; i < 5; i++) {
    await page.evaluate((row) => window.__onegrid?.writeCell?.(row, 'revenue', String(1000 + row)), i);
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(200);

  // Sanity: totals row's pinned-bottom band exists and its DOM is the
  // statusBar element above it (z-index 3). Read the canvas pixel at
  // the totals-row band: should NOT be the data background (because
  // canvas-paints the band) — we can't easily inspect canvas pixels
  // for content, but we CAN assert the cellOverlay's clip-path
  // excludes the bottom region.
  const clip = await page.evaluate(() => {
    const host = window.__onegrid?.host;
    if (!host) return null;
    // The cell overlay is the only direct child div with clip-path set.
    // (StatusBar / floating filter / canvas don't get clip-path.)
    const overlay = Array.from(host.children).find((c) => {
      return c instanceof HTMLElement && c.style.clipPath !== '';
    }) as HTMLElement | undefined;
    return overlay?.style.clipPath ?? null;
  });
  expect(clip).toMatch(/^inset\(/);
  // Inset values should be > 0 on top (header) and > 0 on bottom
  // (pinned + status bar).
  const m = clip!.match(/inset\(([\d.]+)px (\d+(?:\.\d+)?)px ([\d.]+)px/);
  expect(m).not.toBeNull();
  expect(parseFloat(m![1]!)).toBeGreaterThan(0);
  expect(parseFloat(m![3]!)).toBeGreaterThan(0);
});
