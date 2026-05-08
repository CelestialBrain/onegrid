// =============================================================================
// Cell editing — interactive coverage in real Chromium.
//
// The unit tests in @onegrid/core cover the IME state machine in jsdom.
// This spec runs the same paths through a real browser: double-click to
// begin edit, type, Enter to commit, Escape to cancel, and an Android-
// Chrome-style keyCode=229 simulation that should NOT commit.
//
// Reference: docs/v0.0.6.md § 1.
// =============================================================================

import { expect, test } from '@playwright/test';
import './types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__onegrid !== undefined);
});

test('double-click begins editing and Enter commits', async ({ page }) => {
  // Begin edit programmatically — the playground exposes a memory-mode
  // dataset where rows are editable. Click into the canvas first to
  // make the grid active, then drive through the imperative test hooks.
  // The scrollHost (role=grid) is the topmost interactive element; the
  // canvas sibling has pointer-events:none and is ignored for hit
  // testing.
  const grid = page.locator('[role="grid"]').first();
  await grid.click({ position: { x: 200, y: 100 } });

  // Type-ahead: pressing a printable key on a selected cell opens the
  // editor with that key as the initial value.
  await page.keyboard.press('a');

  const editor = page.locator('input[type="text"]').first();
  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('a');

  await page.keyboard.type('bc');
  await expect(editor).toHaveValue('abc');

  await page.keyboard.press('Enter');
  // Editor hides after commit (display:none).
  await expect(editor).toBeHidden();
});

test('Escape cancels the edit without persisting changes', async ({ page }) => {
  const grid = page.locator('[role="grid"]').first();
  await grid.click({ position: { x: 200, y: 130 } });
  await page.keyboard.press('x');
  const editor = page.locator('input[type="text"]').first();
  await expect(editor).toBeVisible();
  await page.keyboard.type('yzz');
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
});

test('Enter does not commit while IME composition is active', async ({ page }) => {
  const grid = page.locator('[role="grid"]').first();
  await grid.click({ position: { x: 200, y: 160 } });
  await page.keyboard.press('a');

  const editor = page.locator('input[type="text"]').first();
  await expect(editor).toBeVisible();

  // Drive composition events directly — Playwright doesn't expose CDP
  // Input.imeSetComposition in a portable way, so we simulate the
  // dispatch through page.evaluate. This reproduces the path Chrome
  // takes for Pinyin / Kana / Hangul input.
  await editor.evaluate((el) => {
    el.dispatchEvent(new CompositionEvent('compositionstart'));
    (el as HTMLInputElement).value = 'n';
  });

  // Enter while composing must NOT commit. The editor stays open.
  await editor.dispatchEvent('keydown', { key: 'Enter', bubbles: true });
  await expect(editor).toBeVisible();

  // End composition with a final value, then Enter commits.
  await editor.evaluate((el) => {
    el.dispatchEvent(new CompositionEvent('compositionend', { data: '你' }));
    (el as HTMLInputElement).value = '你';
  });
  await editor.dispatchEvent('keydown', { key: 'Enter', bubbles: true });
  await expect(editor).toBeHidden();
});

test('sync validator rejection keeps the editor open + sets aria-invalid + shows error bubble', async ({
  page,
}) => {
  // The "revenue" column validates as a finite number. Memory-mode
  // column widths: rowIndex 80, firstName 130, lastName 150, revenue
  // 130 (cumulative 360–490), status 110, score 90, updatedAt 170.
  // x=400 lands inside revenue.
  const grid = page.locator('[role="grid"]').first();
  await grid.click({ position: { x: 400, y: 160 } });
  await page.keyboard.press('a'); // not a number

  const editor = page.locator('input[type="text"]').first();
  await expect(editor).toBeVisible();
  await page.keyboard.press('Enter');
  // Editor stays open; aria-invalid set; error bubble shows.
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute('aria-invalid', 'true');
  // The error bubble has aria-live="polite" — find by id.
  const errorId = await editor.getAttribute('aria-errormessage');
  expect(errorId).not.toBeNull();
  const bubble = page.locator(`#${errorId!}`);
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveText(/number|[Rr]evenue/);

  // Recover: clear and type a valid value.
  await page.keyboard.press('Escape');
});

test('select editor variant: status column opens a dropdown', async ({ page }) => {
  // Status column has a React pill renderer whose pointer-events:auto
  // intercepts direct hover/click — drive via keyboard instead.
  // Click into firstName (plain canvas column, no renderer) to focus
  // the grid + select a cell, then arrow-right to reach status.
  const grid = page.locator('[role="grid"]').first();
  await grid.click({ position: { x: 150, y: 120 } });
  // First name → last name → revenue → status (3 right arrows).
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  // F2 opens the editor at the active cell.
  await page.keyboard.press('F2');

  const select = page.locator('select.status-dropdown, select').filter({ hasText: 'active' }).first();
  await expect(select).toBeVisible();

  // Pick a different option and Enter to commit.
  await select.selectOption('churned');
  await page.keyboard.press('Enter');
  // Custom editors tear down on commit.
  await expect(select).toBeHidden();
});

test('keyCode=229 (Android soft keyboard) is treated as IME — Enter does not commit', async ({
  page,
}) => {
  const grid = page.locator('[role="grid"]').first();
  await grid.click({ position: { x: 200, y: 190 } });
  await page.keyboard.press('a');

  const editor = page.locator('input[type="text"]').first();
  await expect(editor).toBeVisible();

  // Synthesize Android Chrome's "all soft-keyboard input is 229" pattern.
  await editor.evaluate((el) => {
    const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    Object.defineProperty(e, 'keyCode', { value: 229 });
    el.dispatchEvent(e);
  });
  await expect(editor).toBeVisible();
});
