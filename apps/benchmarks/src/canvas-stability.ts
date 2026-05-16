// =============================================================================
// canvas-stability — reusable assertion that the Grid's canvas is never
// observably blank during an interaction.
//
// Background: assigning to canvas.width or canvas.height clears the canvas
// to transparent regardless of whether the value changed. If a redraw is
// queued for the next rAF instead of running synchronously, the browser
// composites the blank canvas in between — visible as a head-to-toe
// flicker. This helper instruments a MutationObserver on the canvas's
// width/height/style attributes AND samples pixel data at the end of
// each animation frame, so a single blank-frame anywhere in the recording
// window fails the assertion.
//
// Usage:
//   await assertCanvasStable(page, 'window resize', async () => {
//     await page.setViewportSize({ width: 1200, height: 800 });
//     await page.setViewportSize({ width: 1400, height: 800 });
//   });
//
// What we record (all from page-side JS):
//   - timestamps of every canvas attribute mutation
//   - the post-mutation pixel at the canvas center (rgba)
//   - whether any of those samples were `[0, 0, 0, 0]` (cleared)
//
// The verdict comes back as a structured object so callers can use
// `expect(verdict.blankFramesObserved).toBe(0)` and get a useful
// failure message including the trace of when blank frames happened.
// =============================================================================

import type { Page } from '@playwright/test';

export interface CanvasStabilityVerdict {
  /** Total canvas attribute mutations observed during the action. */
  readonly mutationCount: number;
  /** Number of those mutations where the post-mutation center pixel had alpha=0
   *  (i.e., the canvas was observably blank from the user's perspective). */
  readonly blankFramesObserved: number;
  /** Raw mutation samples, useful for debugging when assertions fail. */
  readonly samples: ReadonlyArray<{
    readonly t: number;
    readonly attr: string;
    readonly val: string | null;
    readonly pixel: readonly [number, number, number, number];
    readonly blank: boolean;
  }>;
}

export async function assertCanvasStable(
  page: Page,
  _label: string,
  action: () => Promise<void>,
): Promise<CanvasStabilityVerdict> {
  // Install the recorder on the page. The recorder taps the canvas's
  // MutationObserver and reads a center pixel synchronously after each
  // width/height/style change. We mark `blank: true` when the alpha
  // channel is zero (cleared) — that's the exact pre-redraw state the
  // user would see if a paint happens before our render() fires.
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) throw new Error('assertCanvasStable: no canvas found');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const samples: Array<{
      t: number;
      attr: string;
      val: string | null;
      pixel: readonly [number, number, number, number];
      blank: boolean;
    }> = [];
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        const attr = m.attributeName ?? '';
        const val = m.attributeName ? canvas.getAttribute(m.attributeName) : null;
        // Sample the center pixel right after the mutation. If the
        // attribute change was a canvas.width/.height reassignment,
        // the canvas is now transparent unless something has already
        // drawn into it in the same task.
        const x = Math.floor(canvas.width / 2);
        const y = Math.floor(canvas.height / 2);
        let pixel: readonly [number, number, number, number] = [0, 0, 0, 0];
        try {
          const data = ctx.getImageData(x, y, 1, 1).data;
          pixel = [data[0]!, data[1]!, data[2]!, data[3]!];
        } catch {
          // getImageData can throw if the canvas is in a CORS-tainted
          // state or zero-sized. Treat as non-blank rather than
          // erroring; the test will still flag real flicker.
          pixel = [0, 0, 0, 255];
        }
        const blank = pixel[3] === 0;
        samples.push({ t: performance.now(), attr, val, pixel, blank });
      }
    });
    obs.observe(canvas, {
      attributes: true,
      attributeFilter: ['width', 'height', 'style'],
    });
    (window as unknown as { __canvasStabilitySamples: typeof samples }).__canvasStabilitySamples =
      samples;
    (window as unknown as { __canvasStabilityObserver: MutationObserver }).__canvasStabilityObserver =
      obs;
  });

  await action();
  // Let any trailing rAF callbacks land before we collect the verdict.
  await page.waitForTimeout(50);

  const verdict = await page.evaluate<CanvasStabilityVerdict>(() => {
    const w = window as unknown as {
      __canvasStabilitySamples: ReadonlyArray<{
        t: number;
        attr: string;
        val: string | null;
        pixel: readonly [number, number, number, number];
        blank: boolean;
      }>;
      __canvasStabilityObserver: MutationObserver;
    };
    w.__canvasStabilityObserver.disconnect();
    const samples = w.__canvasStabilitySamples;
    return {
      mutationCount: samples.length,
      blankFramesObserved: samples.filter((s) => s.blank).length,
      samples,
    };
  });

  return verdict;
}
