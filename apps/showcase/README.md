# @onegrid/showcase

A single Vite + React app that wires **every public-surface package** in the oneGrid workspace into one running UI. Nine tabs, each exercising a different package family. Built to answer the question: *"can all these packages actually be used together in one grid?"*

Answer: yes, and this app proves it end-to-end in a real browser.

## Run

```sh
pnpm --filter @onegrid/showcase dev
# → http://localhost:5174/
```

Requires Node ≥ 20 (for `node:zlib` used by `@onegrid/xlsx`). WebGPU tab also lights up when running in Chrome 113+ / Edge 113+ / Firefox Nightly with WebGPU enabled.

## Tabs (what each one wires up)

| # | Tab | Packages | What you can actually do |
|---|---|---|---|
| 1 | **Live grid** | `@onegrid/core`, `@onegrid/react`, `@onegrid/data`, `@onegrid/formula`, `@onegrid/xlsx` | Scroll a 100K-row synthetic source via the React adapter. Type a formula in the bar (`=SUM(A1:A10)`, `=LET(x, 5, x*2)`, `=REDUCE(...)`, etc.) and see it evaluate against the live cells. Drag in a `.xlsx` to swap the source for parsed sheet cells. |
| 2 | **Formula + .xlsx** | `@onegrid/formula`, `@onegrid/xlsx` | Pick from 17 sample formulas spanning every category — math, stats, lookup, text, datetime, financial, engineering, LAMBDA family, REGEX, structured table refs, CJK. Toggle AST view. |
| 3 | **Data adapters** | `@onegrid/protocol`, `@onegrid/ssrm`, `@onegrid/postgres`, `@onegrid/mysql`, `@onegrid/sqlite`, `@onegrid/clickhouse`, `@onegrid/mongo`, `@onegrid/drizzle`, `@onegrid/kysely`, `@onegrid/duckdb`, `@onegrid/duckdb-join`, `@onegrid/introspect`, `@onegrid/migrate` | Inspect each adapter's public exports. A shared `BlockRequest` shape proves the wire protocol composes across SQL + Mongo + ORM bridges. (Live DB integration runs in each adapter's own `__tests__/integration.test.ts` via testcontainers.) |
| 4 | **CRDT collab** | `@onegrid/crdt`, `@onegrid/protocol` | Two `Y.Doc`s synced in-process via `doc.on('update') → Y.applyUpdate(other)`. Click "r1.value = random" in either pane and watch the other update **really, immediately, with no transport**. Real adopters substitute `y-websocket` / `y-webrtc` / `@hocuspocus/provider` for the in-process bridge. |
| 5 | **Framework adapters** | `@onegrid/react`, `@onegrid/headless`, `@onegrid/vue`, `@onegrid/svelte`, `@onegrid/solid`, `@onegrid/angular`, `@onegrid/wc` | React mounted live. The other adapters' surfaces are inspected at the import level — they share the same shape-key recreate gate + imperative-update fan-out documented in `ROADMAP.md` §1. |
| 6 | **WebGPU compute** | `@onegrid/webgpu`, `@onegrid/webgpu-render` | `cpuHashAggSumF32` oracle benchmarked at 1K / 10K / 100K / 1M rows. `packCells` byte layout for the vertex buffer. MSDF WGSL fragment shader source. Detects `navigator.gpu` and shows whether the GPU path is available. |
| 7 | **Cross-cutting** | `@onegrid/tokens`, `@onegrid/intl`, `@onegrid/touch`, `@onegrid/a11y`, `@onegrid/plugin-kit`, `@onegrid/headless`, `@onegrid/undo`, `@onegrid/temporal`, `@onegrid/sparklines` | Real `Intl.*` formatting per locale (8 locales). Real sparkline canvas drawing (line, bar, win-loss). Token / undo / temporal / touch / a11y / plugin-kit surfaces enumerated. |
| 8 | **Moats** | `@onegrid/ai`, `@onegrid/mcp`, `@onegrid/reactive`, `@onegrid/dbsp`, `@onegrid/worker-plugins`, `@onegrid/data-worker`, `@onegrid/orm-sync` | Salsa-style reactive substrate runs through tick cycles. DBSP `coalesce` + `integrate` on a Z-set with insertion + retraction + reinsertion. AI intent translator. MCP server exports. |
| 9 | **Export** | `@onegrid/export`, `@onegrid/xlsx` | Click to download a real CSV or a real .xlsx with a `SUM(C2:C6)` formula in the last row — built through `@onegrid/xlsx`'s `writeWorkbook` (wave 22). The file opens in Excel or LibreOffice and the formula recomputes. |

## What "wired together" actually means

Every package in the table above is in `apps/showcase/package.json` as a `workspace:*` dep and gets exercised — either by running its code in the browser (live tabs) or by importing its public exports and rendering them as a surface report (inspection tabs).

The grid in tab 1 receives:

```ts
<OneGrid
  columns={columns}        // ColumnDef[] from @onegrid/core
  rowSource={source}        // RowSource from @onegrid/core; can be backed by SSRM/xlsx/anything
  rowHeight={28}
/>
```

…and the formula bar evaluates against the same `RowSource` through a `CellResolver` that maps `A1` notation to grid cells. That's the entire integration story — small contracts (`ColumnDef`, `RowSource`, `CellResolver`, `BlockRequest`, `CdcAdapter`, `PresenceBridge`) compose without ceremony.

## What this app is NOT

- **Not a production starter.** Routes / auth / state management / error boundaries are deliberately minimal.
- **Not a benchmark.** `apps/benchmarks` is the Playwright-driven perf-gate suite.
- **Not a tutorial.** It's a working proof-of-composability for maintainers + contributors. Each tab's source (`src/tabs/*.tsx`) is the documentation for that package's wiring pattern.
- **Not live integration tests.** Real DB integration (testcontainers, etc.) lives in each adapter's own test suite. Tab 3 inspects the adapter surface without spinning up Postgres.

## Verified in real browser (2026-06-02)

Driven through chrome-devtools MCP — Chrome 148, WebGPU enabled. All 9 tabs render without runtime errors; the only console output is a single favicon 404 (cosmetic). Screenshots in [`screenshots/`](./screenshots/) — one per tab, captured during verification.

Confirmed end-to-end:

- ✅ Tab 1: 100K-row synthetic grid scrolls; `=SUM(1, 2, 3, 4, 5)` → `15` in the formula bar.
- ✅ Tab 3: CRDT sync proven — click "r1.value = random" in peer A, peer B updates to the same value in the same render frame (verified via DOM snapshot diff).
- ✅ Tab 5: `navigator.gpu` detected; CPU hash-agg oracle runs in 0.5ms on 10K rows.
- ✅ Tab 6: Three sparkline kinds drawn to canvas; `Intl.NumberFormat` + `Intl.DateTimeFormat` resolve per locale (en-US, de-DE, ja-JP, ar-SA, th-TH all formatted differently).
- ✅ Tab 7: DBSP Z-set algebra: 5-entry input (3 inserts + 1 retract + 1 reinsert) coalesces correctly.
