// =============================================================================
// Performance: throttled scenarios
//
// Simulates two adversarial conditions via Chrome DevTools Protocol (CDP):
//
//   1. Mid-range Android: 4× CPU throttle (Pixel 6a-class)
//   2. Slow 3G: 400ms RTT, 400 kbps down, 400 kbps up
//
// These run separately from the desktop scenarios because thresholds need
// to be lower — a 4× throttled Pixel won't hit 60 FPS. The goal is not
// matching desktop performance; it's avoiding catastrophic degradation.
// =============================================================================

import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
});

test('memory · 4× CPU throttle · scroll fling stays above 25 FPS', async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // Frames are only recorded on activity; reset and let the scroll loop
  // generate them.
  await page.evaluate(() => {
    window.__onegrid?.reset();
  });

  const start = Date.now();
  while (Date.now() - start < 4_000) {
    await page.evaluate(() => {
      window.__onegrid?.scrollBy(60);
    });
    await page.waitForTimeout(16);
  }

  const m = await page.evaluate(() => window.__onegrid!.getMetrics());
  console.log(`[bench] cpu-4x: ${JSON.stringify(m)}`);

  expect(m.fpsAvg).toBeGreaterThan(25);
  // Even at 4x throttle, no frame should be a full second of stall.
  expect(m.longFramesGt50).toBeLessThan(20);

  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});

test('SSRM · slow 3G · block fetches still complete and grid still fills', async ({
  page,
}) => {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (400 * 1024) / 8,
  });

  await page.click('button:has-text("SSRM")');
  // Slow 3G connect can take several seconds.
  await expect(page.locator('text=1,000,000 rows')).toBeVisible({ timeout: 30_000 });

  await page.evaluate(() => {
    window.__onegrid?.scrollToRow(10_000);
  });
  // Poll for cache growth: each block fetch on slow 3G takes ~600ms
  // (400ms RTT + payload). Two blocks should arrive within ~2s; we
  // poll to 6s to absorb the long tail of TCP slow-start variance.
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      const match = /cache (\d+) blocks/.exec(text);
      return match !== null && Number(match[1]) >= 2;
    },
    undefined,
    { timeout: 6_000 },
  );
  const cacheText = await page.locator('text=/cache \\d+ blocks/').textContent();
  expect(cacheText).toBeTruthy();
  const blocks = Number(/cache (\d+) blocks/.exec(cacheText!)?.[1] ?? '0');
  expect(blocks).toBeGreaterThanOrEqual(2);

  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
});
