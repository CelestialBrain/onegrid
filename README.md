# oneGrid

> A free, open-source, framework-agnostic data grid built for 10M+ rows, multiple databases, formulas, instant updates, and modern ORM integrations. MIT-licensed end to end.

**Status:** v0.0.5 — engine, SSRM, formula engine, DuckDB-WASM mode, cell editing, row grouping, pivot tables, master-detail, GPU compute kernels, and the first wave of framework + ORM adapters.

---

## What oneGrid is

A single MIT-licensed grid that consolidates the things real applications need at scale into one coherent stack:

- **Canvas-first rendering** at 10M rows, with a DOM accessibility shadow and DOM overlays for editors and detail panels.
- **Server-side row model** with cursor pagination, sliding-window block cache, optimistic mutations, and Arrow-friendly payloads.
- **Spreadsheet-class formulas** with a parser, dependency graph (with range nodes for linear-edge growth), and Adapton-style demand-driven recompute.
- **Columnar Apache-Arrow-compatible memory layout** for typed-array sort/filter and zero-copy slicing.
- **Cell editing + clipboard paste** — inline DOM overlay editor (F2/Enter/double-click/type-ahead), Excel-compatible TSV copy + paste, range selection.
- **Row grouping with aggregations** — sum/avg/count/min/max headers with collapse/expand, native to the renderer.
- **Pivot tables** — bucketed (rowKey × pivotKey × measure) materializer that produces a regular ColumnTable, so the existing renderer/sort/filter pipeline carries pivots for free.
- **Pinned rows + column groups + status bar** — totals rows above/below the data, header tree band for grouped columns, selection-aggregate footer.
- **Master-detail expandable rows** with first-class DOM detail panels.
- **DuckDB-WASM mode** as a turnkey in-browser query engine.
- **GPU compute kernels** (WebGPU) — parallel reductions and predicate filters over typed-array columns, with CPU fallbacks.
- **First-class ORM and database adapters** — Drizzle, Kysely, with more on the roadmap.

All under a single MIT license. No paywalled tiers. No commercial-only features.

---

## Packages

| Package | Description |
|---|---|
| [`onegrid`](packages/onegrid) | Convenience umbrella — re-exports core for casual install |
| [`@onegrid/core`](packages/core) | Engine: canvas renderer, accessibility shadow, layout, selection, editor, status bar |
| [`@onegrid/data`](packages/data) | Columnar data layer: Arrow-compatible tables, bitmap selection, sort/filter, group, pivot |
| [`@onegrid/protocol`](packages/protocol) | Wire-format and adapter contract types |
| [`@onegrid/ssrm`](packages/ssrm) | Server-side row model: cursor pagination, block cache, optimistic mutations |
| [`@onegrid/formula`](packages/formula) | Formula engine: parser, dependency graph, demand-driven recompute |
| [`@onegrid/duckdb`](packages/duckdb) | DuckDB-WASM as a client-side query engine |
| [`@onegrid/webgpu`](packages/webgpu) | GPU compute kernels (parallel reduce, predicate→mask filter) for hot data paths |
| [`@onegrid/export`](packages/export) | CSV + XLSX export |
| [`@onegrid/react`](packages/adapters/react) | React adapter |
| [`@onegrid/vue`](packages/adapters/vue) | Vue 3 adapter |
| [`@onegrid/svelte`](packages/adapters/svelte) | Svelte 5 adapter |
| [`@onegrid/solid`](packages/adapters/solid) | Solid.js adapter |
| [`@onegrid/angular`](packages/adapters/angular) | Angular adapter |
| [`@onegrid/wc`](packages/adapters/wc) | Web Component adapter |
| [`@onegrid/drizzle`](packages/adapters/drizzle) | Drizzle ORM datasource adapter |
| [`@onegrid/kysely`](packages/adapters/kysely) | Kysely query-builder datasource adapter |

---

## Architecture

- **[packages/protocol/src/index.ts](packages/protocol/src/index.ts)** — Load-bearing schema. The contract every other package depends on.
- **[apps/playground](apps/playground)** — Live demo with five modes:
  - **In-memory** — materialized typed-array columns with sort/filter/quick-filter, cell editing, copy/paste, master-detail panels, pinned totals row, column groups, status bar, and "group by status" with revenue/score aggregates.
  - **SSRM (localhost:3001)** — block-paginated server-side row model wired to a mock Express server.
  - **Formula** — incremental engine with live recompute, Adapton-style demand-driven evaluation, and a formula bar.
  - **DuckDB (in-browser)** — WASM DuckDB ingesting a 100k-row synthetic CSV, served through the same SsrmRowSource bridge.
  - **Pivot** — pivots a 100k-row dataset by status × firstName with sum(revenue) and avg(score), rendered through the standard column pipeline.
- **[apps/benchmarks](apps/benchmarks)** — Playwright-driven performance gates: 1M-row scroll FPS, SSRM block latency, formula recompute throughput, throttled-CPU floors.

---

## Feature surface (v0.0.5)

| Category | Status |
|---|---|
| Canvas-2D renderer (10M rows, variable row heights via Fenwick) | shipped |
| Frozen columns | shipped |
| Sort (single + multi-column) | shipped |
| Filter (quick-filter + per-column rules) | shipped |
| Range selection (drag, shift-click, ctrl-click multi-range, shift+arrow extend) | shipped |
| Clipboard copy (TSV) + paste (TSV → onPaste hook) | shipped |
| Cell editing (F2/Enter/double-click/type-ahead, Tab/Enter/Escape) | shipped |
| Master-detail expandable rows with DOM detail layer | shipped |
| Pinned top + bottom row sources | shipped |
| Column groups (header tree band) | shipped |
| Status bar (selection aggregates: count/sum/avg/min/max) | shipped |
| Row grouping with aggregations + collapse/expand chevrons | shipped |
| Pivot tables (bucketed compute → materialized output table) | shipped |
| CSV + XLSX export | shipped |
| Server-side row model (cursor + block cache + optimistic mutations) | shipped |
| Formula engine (parser, dep graph, range nodes, Adapton-style recompute) | shipped |
| DuckDB-WASM as a backing engine | shipped |
| GPU compute kernels (WebGPU): parallel reduce + predicate→mask filter | shipped |
| ORM adapters: Drizzle, Kysely | shipped |
| Framework adapters: React, Vue, Svelte, Solid, Angular, Web Components | shipped |
| WebGPU rendering path (full canvas replacement with glyph atlas) | not yet |
| Tree data (hierarchical row model, beyond grouping) | not yet |

---

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm bench       # playwright performance suite
pnpm dev         # playground + mock SSRM server
```

Requires Node 20.10+ and pnpm 9+.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution workflow.

---

## License

[MIT](LICENSE) — for all packages, no exceptions, no paywalled features.
