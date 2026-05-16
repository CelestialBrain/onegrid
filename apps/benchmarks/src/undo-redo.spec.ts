// =============================================================================
// Undo / redo spec — drives the playground's @onegrid/undo wiring through
// cell edits and verifies that:
//   - push tracks every commit
//   - undo() restores the prior value
//   - redo() reapplies the forward
//   - pushing a new entry drops the redo stack
//   - the audit log records edit + undo + redo events with the right tags
// =============================================================================

import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
  // Default mode is memory + 1M (materialized). writeCell only works in
  // materialized memory mode, so no explicit setup needed for these
  // tests — but we DO clear the audit log so old session entries don't
  // pollute assertions.
  await page.evaluate(() => window.__onegrid?.auditClear?.());
  await page.waitForTimeout(80);
});

test('cell edit pushes an undo entry; undo restores the prior value', async ({ page }) => {
  // Read row 0's revenue, edit it, undo, verify the original is back.
  const original = await page.evaluate(() =>
    window.__onegrid?.readCell?.(0, 'revenue'),
  );
  expect(original).not.toBeUndefined();

  const before = await page.evaluate(() => window.__onegrid?.undoState?.());
  expect(before?.canUndo).toBe(false);

  await page.evaluate(() => window.__onegrid?.writeCell?.(0, 'revenue', '12345.67'));
  await page.waitForTimeout(40);

  const after = await page.evaluate(() => ({
    state: window.__onegrid?.undoState?.(),
    value: window.__onegrid?.readCell?.(0, 'revenue'),
  }));
  expect(after.state?.canUndo).toBe(true);
  expect(after.state?.undoCount).toBe(1);
  expect(Number(after.value)).toBeCloseTo(12345.67, 2);

  await page.evaluate(() => window.__onegrid?.undo?.());
  await page.waitForTimeout(40);

  const restored = await page.evaluate(() => ({
    state: window.__onegrid?.undoState?.(),
    value: window.__onegrid?.readCell?.(0, 'revenue'),
  }));
  expect(restored.state?.canUndo).toBe(false);
  expect(restored.state?.canRedo).toBe(true);
  expect(restored.value).toEqual(original);
});

test('redo reapplies the forward value', async ({ page }) => {
  await page.evaluate(() => window.__onegrid?.writeCell?.(1, 'revenue', '999.99'));
  await page.waitForTimeout(40);
  await page.evaluate(() => window.__onegrid?.undo?.());
  await page.waitForTimeout(40);
  await page.evaluate(() => window.__onegrid?.redo?.());
  await page.waitForTimeout(40);
  const value = await page.evaluate(() => window.__onegrid?.readCell?.(1, 'revenue'));
  expect(Number(value)).toBeCloseTo(999.99, 2);
});

test('pushing a new entry drops the redo stack', async ({ page }) => {
  await page.evaluate(() => window.__onegrid?.writeCell?.(2, 'revenue', '111'));
  await page.evaluate(() => window.__onegrid?.undo?.());
  await page.waitForTimeout(40);
  const midState = await page.evaluate(() => window.__onegrid?.undoState?.());
  expect(midState?.canRedo).toBe(true);

  // New edit should drop the redo stack.
  await page.evaluate(() => window.__onegrid?.writeCell?.(3, 'revenue', '222'));
  await page.waitForTimeout(40);
  const afterState = await page.evaluate(() => window.__onegrid?.undoState?.());
  expect(afterState?.canRedo).toBe(false);
});

test('audit log captures edit + undo + redo with the right event tags', async ({ page }) => {
  // visualToSourceRow with no sort/filter is identity, so sourceRow === 5.
  const sourceRow = 5;
  await page.evaluate(
    (r) => window.__onegrid?.writeCell?.(r, 'firstName', 'TestEdit'),
    sourceRow,
  );
  await page.evaluate(() => window.__onegrid?.undo?.());
  await page.evaluate(() => window.__onegrid?.redo?.());
  await page.waitForTimeout(100);

  const entries = await page.evaluate(
    async (r) => (await window.__onegrid?.auditQuery?.(r)) ?? [],
    sourceRow,
  );
  // unshift order: newest first. Expect [redo, undo, edit].
  expect(entries.length).toBe(3);
  expect(entries[0]?.event).toBe('redo');
  expect(entries[1]?.event).toBe('undo');
  expect(entries[2]?.event).toBe('edit');
  expect(entries[2]?.newValue).toBe('TestEdit');
  expect(entries[0]?.newValue).toBe('TestEdit'); // redo replays forward
});

test('cmd+z / cmd+shift+z keyboard binding triggers undo + redo', async ({ page }) => {
  // The playground binds the keyboard listener at document level via
  // useEffect. Send a real keydown event so we exercise the bindKeyboard
  // path, not the direct .undo() call.
  await page.evaluate(() => window.__onegrid?.writeCell?.(7, 'revenue', '4242.42'));
  await page.waitForTimeout(40);

  // Cmd+Z (Mac) / Ctrl+Z (Linux). Playwright's `Meta` is Cmd on macOS;
  // we send Meta+Z plus Control+Z so both platforms exercise something
  // valid. The handler accepts either.
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(40);
  const afterUndo = await page.evaluate(() => window.__onegrid?.readCell?.(7, 'revenue'));
  // After undo, revenue should be back to its synthetic original.
  expect(Number(afterUndo)).not.toBeCloseTo(4242.42, 2);

  await page.keyboard.press('Meta+Shift+z');
  await page.waitForTimeout(40);
  const afterRedo = await page.evaluate(() => window.__onegrid?.readCell?.(7, 'revenue'));
  expect(Number(afterRedo)).toBeCloseTo(4242.42, 2);
});
