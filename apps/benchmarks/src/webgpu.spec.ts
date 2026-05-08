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
  // Headless Chromium often ships without a WebGPU adapter (depends
  // on Vulkan/Metal driver availability in the install). Skip the
  // gate cleanly when adapter request fails; the assertion exists
  // to catch *kernel correctness* regressions on developer machines
  // + CI runners that DO have WebGPU enabled.
  const hasAdapter = await page.evaluate(async () => {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (!gpu) return false;
    try {
      const adapter = await gpu.requestAdapter();
      return adapter !== null;
    } catch {
      return false;
    }
  });
  test.skip(!hasAdapter, 'WebGPU adapter unavailable in this runtime');

  const button = page.getByRole('button', { name: 'GPU bench' });
  await button.click();
  // Poll the document body's text content for the bench summary.
  // getByText with a regex-against-text was tripping over the Δ
  // character in some environments; raw text scan is more robust.
  await expect
    .poll(async () => (await page.locator('body').textContent()) ?? '', {
      timeout: 15_000,
      message: 'GPU bench did not produce a "% Δ" summary',
    })
    .toContain('% Δ');
  const text = (await page.locator('body').textContent()) ?? '';
  expect(text).toMatch(/cpu \d+ms/);
  expect(text).toMatch(/gpu \d+ms/);
  const m = /([\d.]+)% Δ/.exec(text);
  expect(m).not.toBeNull();
  const deltaPct = Number(m![1]);
  // f32 sum on 4M random floats has rounding error well under 0.5%.
  expect(deltaPct).toBeLessThan(0.5);
});
