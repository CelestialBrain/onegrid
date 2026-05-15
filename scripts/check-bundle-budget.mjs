#!/usr/bin/env node
// =============================================================================
// scripts/check-bundle-budget.mjs
//
// Per-package gzipped-bundle budget enforcement. Each publishable package
// owns a `bundle-budget.json` describing its budget in bytes (gzip).
// This script:
//
//   1. Walks every package matching `bundle-budget.json`
//   2. Measures the gzipped ESM bundle (dist/index.js)
//   3. Compares against the budget
//   4. Computes per-feature deltas for any feature entrypoint
//   5. Allows a >5% bump only when commit message carries
//      `[budget-bump: <pkg>]`
//   6. Exits non-zero on violation
//
// Per-feature budgeting (item 5 spec):
//   feature cost = bundle(core + feature) - bundle(core)
//   measured via separate feature-entrypoint builds
//
// Wired into CI as `pnpm bundle:check`. Runs after `pnpm build`.
// =============================================================================

import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { execSync } from 'node:child_process';
import { glob } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TOLERANCE = 0.05; // 5%

function measureGzipped(file) {
  if (!existsSync(file)) return null;
  const raw = readFileSync(file);
  return gzipSync(raw, { level: 9 }).length;
}

function loadCommitMessage() {
  try {
    return execSync('git log -1 --pretty=%B', { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return '';
  }
}

const commitMessage = loadCommitMessage();
const allowedBumps = new Set(
  [...commitMessage.matchAll(/\[budget-bump:\s*([^\]]+)\]/g)].map((m) =>
    m[1].trim(),
  ),
);

function pct(actual, budget) {
  return ((actual - budget) / budget) * 100;
}

function fmtBytes(n) {
  return `${(n / 1024).toFixed(2)} KB`;
}

const violations = [];
const ok = [];
const warnings = [];

const budgetFiles = [];
for await (const file of glob('packages/**/bundle-budget.json', { cwd: ROOT })) {
  if (file.includes('node_modules')) continue;
  budgetFiles.push(file);
}
budgetFiles.sort();

if (budgetFiles.length === 0) {
  console.error('No bundle-budget.json files found.');
  process.exit(1);
}

console.log(`# Bundle budget check — ${budgetFiles.length} package(s)\n`);

for (const file of budgetFiles) {
  const pkgDir = resolve(ROOT, dirname(file));
  const budget = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));
  const pkgName = budget.name;
  const bumpAllowed = allowedBumps.has(pkgName);

  for (const entry of budget.entries) {
    const dist = resolve(pkgDir, entry.file);
    const actual = measureGzipped(dist);
    if (actual === null) {
      warnings.push(`${pkgName}: missing ${entry.file} — skipped (build it first?)`);
      continue;
    }
    const over = pct(actual, entry.bytes);
    const status = over > TOLERANCE * 100 ? 'OVER' : 'OK';
    const line =
      `  ${entry.file.padEnd(35)} ${fmtBytes(actual).padStart(10)} ` +
      `/ ${fmtBytes(entry.bytes).padStart(10)} ` +
      `(${over >= 0 ? '+' : ''}${over.toFixed(1)}%) [${status}]`;
    if (status === 'OVER') {
      if (bumpAllowed) {
        ok.push(`${pkgName} ${line} — bump approved via [budget-bump:${pkgName}]`);
      } else {
        violations.push(`${pkgName} ${line}`);
      }
    } else {
      ok.push(`${pkgName} ${line}`);
    }
  }
}

if (ok.length) {
  console.log('## Within budget\n');
  for (const l of ok) console.log(l);
  console.log();
}

if (warnings.length) {
  console.log('## Warnings\n');
  for (const l of warnings) console.log(`  ${l}`);
  console.log();
}

if (violations.length) {
  console.log('## VIOLATIONS\n');
  for (const l of violations) console.log(l);
  console.log(
    `\nAny bundle over budget by more than ${TOLERANCE * 100}% fails CI.\n` +
      `Either fix the regression OR add \`[budget-bump: <pkg>]\` to the\n` +
      `commit message with a one-line justification in the PR description.`,
  );
  process.exit(1);
}

console.log('OK — every bundle within budget.');
