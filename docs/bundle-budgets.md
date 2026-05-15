# Bundle budgets

oneGrid enforces per-package gzipped-bundle budgets in CI. The goal is
that "v0.0.9 is still light" can be checked by a machine, not by
reading the diff.

## How it works

Each publishable package has a `bundle-budget.json`:

```json
{
  "name": "@onegrid/core",
  "entries": [
    {
      "file": "dist/index.js",
      "bytes": 30720
    }
  ]
}
```

`scripts/check-bundle-budget.mjs` walks every `bundle-budget.json`, gzips
the file at level 9, and compares against the budget. Anything **>5%
over budget** fails CI.

Run locally:

```sh
pnpm build
pnpm bundle:check
```

## Current budgets (gzip, level 9)

| Package                  | Budget   | Why                                                              |
| ------------------------ | -------- | ---------------------------------------------------------------- |
| `@onegrid/protocol`      | 256 B    | Types-only. Any growth means runtime code crept in.              |
| `@onegrid/plugin-kit`    | 3 KB     | Facets + Compartment + 10 registries.                            |
| `@onegrid/headless`      | 2.5 KB   | Lifecycle wrapper. Real cost is in `@onegrid/core`.              |
| `@onegrid/tokens`        | 2.5 KB   | DTCG compile + watcher. Theme/density bundles are sub-paths.     |
| `@onegrid/react`         | 4 KB     |                                                                  |
| `@onegrid/data`          | 7.5 KB   |                                                                  |
| `@onegrid/ssrm`          | 8 KB     | Block fetcher + LRU + cursor + row-diff + optimistic + Arrow.    |
| `@onegrid/formula`       | 8 KB     | Adapton engine + 41 base functions.                              |
| `@onegrid/core`          | 30 KB    | Canvas + ARIA shadow + FenwickHeights + selection + editing.     |

Sub-path bundles (themes, density, future feature-entrypoints) get
their own entries inside the package's `bundle-budget.json`.

## Per-feature budgeting

For features that ship via separate entrypoints under
`@onegrid/core/features/*` (planned), the cost is measured as

```
feature cost = bundle(core + feature) - bundle(core)
```

Each feature gets its own entry in `core/bundle-budget.json` with the
delta budget rather than the absolute size.

WebGPU paths and their CPU fallbacks both ship → the budget is the
**sum**, not the max. The fallback is not "free" just because it's the
non-preferred branch.

## Bumping a budget

A bump must be intentional. To approve one:

1. Increase the `bytes` value in the package's `bundle-budget.json`.
2. Add `[budget-bump: <package-name>]` to the commit message.
3. Include a one-line justification in the PR description ("added
   pivot-stage compiler, +1.4 KB").

CI parses commit messages for `[budget-bump: <name>]` markers and
allows the violation through only for the named package.

## When a budget breaks

The output looks like this:

```
## VIOLATIONS

@onegrid/core   dist/index.js   34.10 KB / 30.00 KB (+13.7%) [OVER]
```

Either:

- **Fix the regression** — tree-shake dead code, factor a feature
  out behind a sub-path import, drop a transitive dep.
- **Bump the budget** — only if the added cost is intentional. Justify
  it.

The check is opinionated by design. A 5% tolerance is enough to
absorb code-shifting noise but tight enough that a real regression
trips it.
