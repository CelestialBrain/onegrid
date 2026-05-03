# oneGrid

> A free, open-source, framework-agnostic data grid built for 10M+ rows, multiple databases, formulas, instant updates, and modern ORM integrations. MIT-licensed end to end.

**Status:** v0.0.5 — core engine, SSRM, formula engine, DuckDB-WASM mode, master-detail, and the first wave of framework + ORM adapters.

---

## What oneGrid is

A single MIT-licensed grid that consolidates the things real applications need at scale into one coherent stack:

- **Canvas-first rendering** at 10M rows, with a DOM accessibility shadow and DOM overlays for editors and detail panels.
- **Server-side row model** with cursor pagination, sliding-window block cache, optimistic mutations, and Arrow-friendly payloads.
- **Spreadsheet-class formulas** with a parser, dependency graph (with range nodes for linear-edge growth), and Adapton-style demand-driven recompute.
- **Columnar Apache-Arrow-compatible memory layout** for typed-array sort/filter and zero-copy slicing.
- **DuckDB-WASM mode** as a turnkey in-browser query engine.
- **Master-detail expandable rows** with first-class DOM detail panels.
- **First-class ORM and database adapters** — Drizzle, Kysely, with more on the roadmap.

All under a single MIT license. No paywalled tiers. No commercial-only features.

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
| [`@onegrid/duckdb`](packages/duckdb) | DuckDB-WASM as a client-side query engine |
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
- **[apps/playground](apps/playground)** — Live demo with four modes: in-memory, SSRM (over a localhost server), formula engine, and DuckDB-WASM in-browser.
- **[apps/benchmarks](apps/benchmarks)** — Playwright-driven performance gates: 1M-row scroll FPS, SSRM block latency, formula recompute throughput, throttled-CPU floors.

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
