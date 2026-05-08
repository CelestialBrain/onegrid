// =============================================================================
// WebGPU compute kernel — real-Chromium correctness gate.
//
// jsdom has no WebGPU runtime, so the @onegrid/webgpu unit tests cover
// only the CPU fallbacks. This spec is the integration gate that
// catches WGSL-level bugs (reserved keywords, layout binding errors,
// dispatch argument mistakes) by running the actual GPU kernel and
// comparing its result to the CPU fallback.
//
// First failure caught: WGSL's `meta` is a reserved keyword. The
// shader silently failed compilation, the pipeline was invalid, every
// dispatch was a no-op, and gpuSumFloat32 returned 0 — a 100% delta
// from cpuSumFloat32. Renamed to `params` and added this gate so the
// class of bug can't recur.
// =============================================================================

import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
});

test('GPU bench produces a sum that agrees with the CPU baseline (≤0.5%)', async ({
  page,
}) => {
  // The GPU bench button is wired to runGpuBench in App.tsx — clicking
  // it runs cpuSumFloat32(N) then gpuSumFloat32(N) on 4M random
  // floats and writes the result into a status span.
  const button = page.getByRole('button', { name: 'GPU bench' });
  await button.click();
  // The status span updates from "WebGPU available" to a benchmark
  // summary that includes "speedup" and "Δ".
  await page.waitForFunction(
    () => {
      const span = document.querySelector(
        'button[aria-label*="GPU"], button[title*="cpu"]',
      ) as HTMLElement | null;
      return span?.title?.includes('Δ');
    },
    { timeout: 15_000 },
  );

  const status = await page
    .locator('button', { hasText: 'GPU bench' })
    .evaluate((el) => (el as HTMLElement).title);

  expect(status).toMatch(/cpu \d+ms/);
  expect(status).toMatch(/gpu \d+ms/);
  // Pull the percentage out and require numeric agreement. f32 sum on
  // 4M random floats has rounding error well under 0.5%.
  const m = /([\d.]+)% Δ/.exec(status);
  expect(m).not.toBeNull();
  const deltaPct = Number(m![1]);
  expect(deltaPct).toBeLessThan(0.5);
});
