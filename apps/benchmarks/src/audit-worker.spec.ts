// =============================================================================
// Audit-worker spec — verifies the off-main-thread per-row edit log:
//   - append → query round-trip
//   - per-row ring buffer cap (50 entries)
//   - global row cap (200 rows, FIFO eviction by insertion order)
//   - IDB persistence across reload (a soft check — IDB writes are
//     debounced 2 s so the spec waits past that interval)
//   - clear wipes everything
// =============================================================================

import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
  await page.evaluate(() => window.__onegrid?.auditClear?.());
  // The worker handles `clear` async; wait a moment so subsequent
  // queries don't see stale state from a prior test.
  await page.waitForTimeout(120);
});

test('append → query round-trip', async ({ page }) => {
  await page.evaluate(() => {
    const w = window.__onegrid!;
    w.auditAppend?.(42, 1_700_000_000_000, 'edit', 'revenue', '100', '200');
    w.auditAppend?.(42, 1_700_000_001_000, 'edit', 'status', 'active', 'pending');
  });
  await page.waitForTimeout(80);

  const entries = await page.evaluate(
    async () => (await window.__onegrid!.auditQuery?.(42)) ?? [],
  );
  expect(entries.length).toBe(2);
  // unshift order: newest first
  expect(entries[0]?.columnId).toBe('status');
  expect(entries[1]?.columnId).toBe('revenue');
  expect(entries[1]?.oldValue).toBe('100');
  expect(entries[1]?.newValue).toBe('200');
});

test('per-row ring buffer caps at 50 entries (FIFO)', async ({ page }) => {
  await page.evaluate(() => {
    const w = window.__onegrid!;
    for (let i = 0; i < 75; i++) {
      w.auditAppend?.(7, 1_700_000_000_000 + i, 'edit', 'revenue', String(i), String(i + 1));
    }
  });
  await page.waitForTimeout(150);

  const entries = await page.evaluate(
    async () => (await window.__onegrid!.auditQuery?.(7)) ?? [],
  );
  expect(entries.length).toBe(50);
  // Newest first: entry 0 is the last write (i=74).
  expect(entries[0]?.newValue).toBe('75');
  // Oldest survivor: i=25 (since i=0..24 were dropped).
  expect(entries[entries.length - 1]?.newValue).toBe('26');
});

test('global cap evicts oldest row FIFO when exceeded', async ({ page }) => {
  await page.evaluate(() => {
    const w = window.__onegrid!;
    // Insert 220 unique rows. Cap is 200 → first 20 should be evicted.
    for (let row = 0; row < 220; row++) {
      w.auditAppend?.(row, 1_700_000_000_000 + row, 'edit', 'revenue', '', String(row));
    }
  });
  await page.waitForTimeout(200);

  // Row 0 should have been evicted (it was inserted first; cap 200).
  const evicted = await page.evaluate(
    async () => (await window.__onegrid!.auditQuery?.(0)) ?? [],
  );
  expect(evicted.length).toBe(0);

  // Row 219 should still be there.
  const surviving = await page.evaluate(
    async () => (await window.__onegrid!.auditQuery?.(219)) ?? [],
  );
  expect(surviving.length).toBe(1);
  expect(surviving[0]?.newValue).toBe('219');
});

test('clear wipes all entries', async ({ page }) => {
  await page.evaluate(() => {
    window.__onegrid?.auditAppend?.(3, Date.now(), 'edit', 'revenue', '0', '1');
  });
  await page.waitForTimeout(60);
  await page.evaluate(() => window.__onegrid?.auditClear?.());
  await page.waitForTimeout(120);
  const after = await page.evaluate(
    async () => (await window.__onegrid!.auditQuery?.(3)) ?? [],
  );
  expect(after.length).toBe(0);
});

test('values are truncated to 60 chars before storage', async ({ page }) => {
  const longValue = 'x'.repeat(120);
  await page.evaluate((v) => {
    window.__onegrid?.auditAppend?.(11, Date.now(), 'edit', 'firstName', '', v);
  }, longValue);
  await page.waitForTimeout(80);
  const entries = await page.evaluate(
    async () => (await window.__onegrid!.auditQuery?.(11)) ?? [],
  );
  expect(entries.length).toBe(1);
  // Truncation appends ellipsis at char 60 (59 + '…').
  expect(entries[0]?.newValue.length).toBeLessThanOrEqual(60);
  expect(entries[0]?.newValue.endsWith('…')).toBe(true);
});

test('survives reload via IndexedDB persistence', async ({ page }) => {
  // Persist interval inside the worker is 2 s. Wait longer than that.
  await page.evaluate(() => {
    window.__onegrid?.auditAppend?.(
      9999,
      1_700_000_000_000,
      'edit',
      'revenue',
      'before',
      'after',
    );
  });
  await page.waitForTimeout(2400);

  await page.reload();
  await page.waitForFunction(() => window.__onegrid !== undefined);
  // Hydrate is async — give it a moment.
  await page.waitForTimeout(300);

  const entries = await page.evaluate(
    async () => (await window.__onegrid!.auditQuery?.(9999)) ?? [],
  );
  expect(entries.length).toBeGreaterThanOrEqual(1);
  expect(entries.find((e) => e.newValue === 'after')).toBeTruthy();

  // Cleanup for next test run.
  await page.evaluate(() => window.__onegrid?.auditClear?.());
  await page.waitForTimeout(80);
});
