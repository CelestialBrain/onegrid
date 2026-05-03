# oneGrid

> A free, open-source, framework-agnostic data grid that consolidates features across every grid library — built to handle 10M+ rows, multiple databases, formulas, instant updates, and modern ORM integrations. MIT-licensed.

**Status:** v0.0.1 — name reserved on npm, monorepo scaffold in place. Implementation in progress.

---

## Why oneGrid

Every existing grid library forces a tradeoff. AG Grid Enterprise is feature-rich but $1,000+/dev/yr and DOM-bound past ~100k rows. Glide Data Grid renders millions of rows on canvas but is React-only and has no server-side row model. TanStack Table is headless and tiny but pushes virtualization onto consumers. Handsontable + HyperFormula has Excel-class formulas but is GPL/commercial.

oneGrid combines:

- **Glide-class rendering** (canvas 2D primary, WebGPU "turbo" path) at 10M rows
- **AG Grid Enterprise feature set** (SSRM, pivoting, master-detail, range selection)
- **TanStack-class framework agnosticism** (vanilla TS core, thin adapters)
- **DuckDB-class data engine** (Arrow columnar memory, optional DuckDB-WASM)
- **HyperFormula-class formulas** with **Adapton-style demand-driven recompute**
- **First-class ORM/database adapters** (Drizzle, Kysely, raw drivers, more coming)

All under a single MIT license.

---

## Packages

| Package | Description |
|---|---|
| [`onegrid`](packages/onegrid) | Convenience umbrella — re-exports core for casual install |
| [`@onegrid/core`](packages/core) | Engine: canvas renderer, accessibility shadow, signals, layout |
| [`@onegrid/data`](packages/data) | Columnar data layer: Arrow-compatible tables, bitmap selection, sort cache |
| [`@onegrid/protocol`](packages/protocol) | Wire-format and adapter contract types |
| [`@onegrid/ssrm`](packages/ssrm) | Server-side row model: cursor pagination, block cache, optimistic mutations |
| [`@onegrid/formula`](packages/formula) | Formula engine: parser, dependency graph, demand-driven recompute |
| [`@onegrid/duckdb`](packages/duckdb) | Optional plugin: DuckDB-WASM as a client-side query engine |
| [`@onegrid/react`](packages/adapters/react) | React adapter |
| [`@onegrid/vue`](packages/adapters/vue) | Vue 3 adapter |
| [`@onegrid/svelte`](packages/adapters/svelte) | Svelte 5 adapter |
| [`@onegrid/solid`](packages/adapters/solid) | Solid.js adapter |
| [`@onegrid/angular`](packages/adapters/angular) | Angular adapter |
| [`@onegrid/wc`](packages/adapters/wc) | Optional Web Component adapter |
| [`@onegrid/drizzle`](packages/adapters/drizzle) | Drizzle ORM datasource adapter |
| [`@onegrid/kysely`](packages/adapters/kysely) | Kysely query-builder datasource adapter |

---

## Architecture & research

- **[RESEARCH.md](RESEARCH.md)** — May 2026 architecture brief: rendering strategy, data structures, dependency tracking, SSRM design, accessibility, benchmarks, source references.
- **[docs/feature-matrix.md](docs/feature-matrix.md)** — Cross-library feature matrix across 19 grid libraries (AG Grid, TanStack Table, Glide, Handsontable, MUI X, Perspective, Quadratic, SlickGrid, RevoGrid, Tabulator, Grid.js, plus 8 commercial). Identifies the table-stakes features oneGrid v1 must ship, the premium features that become MIT moats, and the universal gaps no one handles well.
- **[docs/grids/](docs/grids/)** — Per-library deep dives feeding the matrix.
- **[packages/protocol/src/index.ts](packages/protocol/src/index.ts)** — Load-bearing schema. The contract every other package depends on.

---

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

Requires Node 20.10+ and pnpm 9+.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution workflow.

---

## License

[MIT](LICENSE) — for all packages, no exceptions, no paywalled features.
