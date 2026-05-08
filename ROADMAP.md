# oneGrid Roadmap

The full list of work that gets oneGrid from a credible v0.0.5 grid to the
most capable open-source grid in the JavaScript ecosystem. Items are
grouped by where they create leverage, not by release order — see
"Sequencing" at the bottom for milestone framing.

**Last updated:** 2026-05-09

## Status legend

- ✅ **Shipped** — landed on `main`, has tests, exposed in the public API
- 🟡 **In progress** — partial implementation, behind a flag, or scaffolded
- 🔵 **Planned** — design is settled, ready to be picked up
- 🟣 **Research** — needs prototype + measurement before committing to design

---

## 1. Grid surface area

The "feels like a real grid" pieces. Each item below is something a real
application reaches for at some point.

| Feature | Status | Notes |
|---|---|---|
| Canvas-2D renderer (10M rows, variable heights) | ✅ | Fenwick-backed |
| Frozen columns | ✅ | |
| Range selection (drag, shift-click, ctrl-click multi-range) | ✅ | |
| Sort (single + multi) | ✅ | |
| Filter (quick + per-column rules) | ✅ | |
| Cell editing (F2/Enter/double-click/type-ahead) | ✅ | DOM overlay |
| Clipboard copy/paste (TSV) | ✅ | |
| Master-detail expandable rows | ✅ | DOM detail layer |
| Pinned top + bottom row sources | ✅ | |
| Column groups (header tree band) | ✅ | |
| Status bar (selection aggregates) | ✅ | |
| Row grouping with aggregations | ✅ | |
| Pivot tables | ✅ | |
| CSV + XLSX export | ✅ | |
| Tree data | ✅ | `flattenTree` / `RowTreeMeta` in @onegrid/data; lazy `loadChildren` per node; nested grids inside detail panels piggy-back on the same row-meta path |
| Server-side hierarchical fetches | ✅ | `BlockRequest.parentId` + per-row `HierarchyEntry`; `createSsrmTreeSource` lazy children fetcher |
| Set filter (distinct-values checkbox + counts) | ✅ | `enumerateDistinct` in @onegrid/data + popover UI |
| Floating filter row | ✅ | Per-column `<input role=searchbox>` band, sticky below header |
| Column tool panel / sidebar | ✅ | React `<ColumnToolPanel>` with show/hide + within-panel drag-drop; `Grid.setColumns()` / `getColumns()` imperative API |
| Context menu | ✅ | `ContextMenuTarget` discriminated union; native menu suppressed; consumer renders the popover |
| Drag-drop column reorder | ✅ | Header pointerdown → drop indicator → in-place column splice; click-vs-drag at the 6px threshold |
| **Drag-drop row reorder** | 🔵 | Within-tree-or-group reorder is a v0.0.8 follow-up |
| **Row + column span (merged cells)** | 🔵 | |
| Sticky group rows | ✅ | `drawStickyGroupRow` re-renders the topmost ancestor at the data band top with aggregates intact |
| **Loading / no-rows / skeleton overlays** | 🔵 | |
| Tooltip system | ✅ | Single shared `<div role=tooltip>` with hover delay + Escape/scroll dismiss |
| Custom cell renderers | ✅ | Pool + overlay layer in core; React adapter shipped (Vue/Svelte/Solid follow-up) |
| Editor variants | ✅ | `createSelectEditor` / `createDateEditor` / `createTextareaEditor` (autocomplete + multi-select chips follow-up) |
| Selection checkbox column | ✅ | `createSelectionCheckboxColumn` factory + `<SelectAllCheckbox>` tri-state widget; module-scoped store keeps cells in sync via `useSyncExternalStore` |
| **Range chart** | 🔵 | Select cells → embed a chart bound to the selection |
| **Sparklines in cells** | 🔵 | |
| **Undo/redo** | 🔵 | Transactional edit history |
| **Light theme + density variants** | 🔵 | Currently one dark theme |
| IME composition-aware editor commit | ✅ | State machine on composition events + `keyCode===229` guard |
| Cell editor validation | ✅ | Sync + async with `AbortController`; aria-invalid + aria-errormessage + LiveAnnouncer fallback |
| Range fill-handle | ✅ | Bottom-right handle, dashed-outline drag preview, `onFillHandle(source, fill)` callback |
| **Multi-select cell type with chips** | 🔵 | Multi-value column type rendering chips per cell, with a popover editor |
| **Column-group visibility manager** | 🔵 | Toggle whole header groups on/off in one action (single-column visibility ships in `<ColumnToolPanel>`) |
| **Header text wrap** | 🔵 | Opt-in wrap with auto-row-height in the header band |
| **Page-level sticky header** | 🔵 | Header sticks to page scroll, not just the grid container — works for grids embedded in long-scroll pages |
| **FDC3 broadcast + intent listener** | 🔵 | Fintech-desk interop: broadcast row context to peer apps, receive intents back |
| **Mobile swipe-row actions** | 🔵 | Left/right swipe templates with action buttons; touch-first interaction model |

## 2. Performance

Where commercial grids have soft ceilings. These are the wins that show up
on benchmark charts.

| Feature | Status | Notes |
|---|---|---|
| Velocity-aware overscan | ✅ | Basic — needs adaptive tuning |
| GPU compute kernels (parallel reduce + filter mask) | ✅ | `@onegrid/webgpu` |
| **Column virtualization** | 🔵 | For 500+ column grids |
| **Web Worker offload** | 🔵 | Sort/filter/group/pivot off the main thread |
| **Full WebGPU rendering path** | 🟣 | Canvas replacement: MSDF/SDF glyph atlas first, Slug-style per-curve evaluation as a phase-2 fallback, per-cell vertex buffer pipeline |
| **Arrow IPC ingestion** | 🔵 | Zero-copy from server, streaming via Arrow Flight (gRPC-Web/Connect-Web) |
| **Differential dataflow** | 🟣 | Source change → recompute only affected derived views; grounded in DBSP operator algebra (Budiu et al. VLDB 2023) |
| **Incremental redraw with dirty-rect protocol** | 🟣 | Track dirty cell rectangles since last frame; paint only those rectangles |
| **SharedArrayBuffer for cross-thread viewport** | 🟣 | Worker writes directly into a SAB the renderer reads — eliminates postMessage cost |
| **Adaptive overscan** | 🔵 | Velocity-aware tuning that learns from real fling traces |
| Aggregation-pushdown SSRM | ✅ | `BlockRequest.aggregations?: AggregationModel`; database adapters emit one row per group with the alias columns + `__count__` |
| **Worker-pool budget controller** | 🔵 | Cap how many cores the grid consumes so collaborative apps don't stall |
| **BigInt-safe formula path** | 🔵 | Keep DB-typed integers in their own lane through the formula graph for currency / large-id columns |
| **GPU hash-aggregate for group-by** | 🟣 | Parallel hash-aggregate compute kernel beyond reduce/filter |

## 3. Hierarchy & nesting

The "inner tables" axis: data and UI that nest cleanly.

| Feature | Status | Notes |
|---|---|---|
| Master-detail expandable rows | ✅ | |
| Row grouping (aggregation-driven, not data-driven) | ✅ | |
| Tree data with lazy-load children | ✅ | Caller-supplied tree, `loadChildren` invoked on first expand; same `getRowMeta` / `onToggleGroup` path used by row grouping |
| Nested grids inside detail panels | ✅ | Recursive oneGrid-in-oneGrid; `Grid.onDetailUnmount` lifecycle hook lets the consumer destroy() inner instances on collapse / scroll-out / outer destroy |
| Server-side tree | ✅ | `BlockRequest.parentId` + per-row `HierarchyEntry`; `createSsrmTreeSource` lazy children fetcher; `parentId` participates in cache fingerprint |
| **Recursive grouping + pivot mix** | 🔵 | Tree data with pivot columns at leaf level |
| **Drag-drop reorder within tree / group** | 🔵 | Reorder rows across siblings in tree data and across groups; the most-requested gap in the wider grid ecosystem |
| Aggregation-aware group-row pin | ✅ | `drawStickyGroupRow` re-renders the topmost ancestor group at the data band top with its aggregates intact |

## 4. Database + data infrastructure

The consolidation moat. oneGrid is positioned to own the database edge in
ways commercial grids are structurally bad at.

| Feature | Status | Notes |
|---|---|---|
| Server-side row model (cursor + block cache) | ✅ | |
| Drizzle adapter | ✅ | |
| Kysely adapter | ✅ | |
| DuckDB-WASM as backing engine | ✅ | |
| Raw Postgres adapter | ✅ | `@onegrid/postgres` — pure SQL compiler + `pg`-compatible queryable + LISTEN/NOTIFY CDC against an outbox table |
| MySQL adapter | ✅ | `@onegrid/mysql` — same compiler shape; polling-based CDC against an outbox (no LISTEN/NOTIFY equivalent without binlog) |
| SQLite adapter | ✅ | `@onegrid/sqlite` — works with better-sqlite3, node:sqlite, bun:sqlite, Cloudflare D1, libsql/Turso through one queryable interface |
| ClickHouse adapter | ✅ | `@onegrid/clickhouse` — native named-parameter syntax (`{p0:Type}`), JSONEachRow + Arrow IPC response paths |
| MongoDB adapter | ✅ | `@onegrid/mongo` — find / aggregation pipeline; change-streams-backed CDC with resume tokens |
| **Snowflake adapter** | 🔵 | |
| **BigQuery adapter** | 🔵 | |
| **Elasticsearch adapter** | 🔵 | |
| **Prisma adapter** | 🔵 | |
| Live updates / subscriptions | ✅ | Postgres LISTEN/NOTIFY, Mongo change streams, MySQL/SQLite polling-outbox — all conform to the universal `CdcAdapter` shape from `@onegrid/ssrm` |
| Optimistic mutations + conflict resolution | ✅ | `createOptimisticMutator` orchestrates apply → submit → commit/rollback with onCommit / onRollback / onTransportError callbacks; tracks pending mutations by clientId |
| **Row-level security / column permissions** | 🔵 | Declarative, server-enforced |
| **Cross-database joins via DuckDB-WASM** | 🟣 | Remote Postgres + local Parquet + CSV, joined in-browser |
| **Query builder UI** | 🟣 | Build SQL/Mongo queries through the grid UI itself, anchored on the column tool panel |
| Keyset/cursor canonicalization in SSRM | ✅ | Canonical `ks:<base64-json>` codec in `@onegrid/ssrm`; legacy `offset:N` accepted via `parseLegacyOffsetCursor` |
| Aggregation-pushdown protocol | ✅ | `BlockRequest.aggregations?: AggregationModel`; servers emit one row per group with alias columns + `__count__` |
| Real-time row diff protocol | ✅ | `RowDiff { kind, version, pkey, fields? }` + `ResyncRequest`/`ResyncResponse` with `snapshot: true` fallback when the gap is too large to replay |
| Universal CDC adapter shape | ✅ | `CdcAdapter` + `createRowDiffStream` in `@onegrid/ssrm`; gap detection via `RowDiffTracker` |
| Schema introspection helper | ✅ | `@onegrid/introspect` — `columnsFromSchema`, `schemaFromSqlRows`, `schemaFromSqliteRows`, `columnTypeFromSql`. ORM-specific paths (Drizzle / Prisma) follow in v0.0.9 |

## 5. Differentiation moats

Where oneGrid wins on its own axes — not by parity, but because it owns
the data layer and rendering layer in a way commercial alternatives don't.

| Feature | Status | Notes |
|---|---|---|
| Formula engine (Adapton-style demand-driven recompute) | ✅ | |
| Multi-framework adapters (React/Vue/Svelte/Solid/Angular/WC) | ✅ | |
| ORM-first data layer | ✅ | First commit-class citizen, not an afterthought |
| GPU compute kernels | ✅ | |
| **Live ORM sync** | 🟣 | Grid edits → DB writes via Drizzle/Kysely/Prisma, atomically |
| **Time-travel / temporal data** | 🟣 | Every edit versioned; scrub timeline UI |
| **Collaborative real-time editing** | 🟣 | CRDT (Yjs / Automerge) over the row source |
| **AI integration** | 🟣 | Natural language → filters/sorts/formulas/charts |
| **Notebook-style cells** | 🟣 | Jupyter pattern over grid data; formula + DuckDB + GPU as the kernel |
| **Plugin / extension API** | 🔵 | Third-party cell types, exports, data sources, themes |
| **Embeddable block** | 🟣 | Drop oneGrid into Notion/Coda/Obsidian-style hosts |
| **Linear range decomposition in the formula engine** | 🔵 | Sharing work across overlapping aggregates (A1:A100 → A1:A99 + A100) |
| **Spill-style dynamic arrays** | 🔵 | Excel-365-style spilling formulas with `#SPILL!` errors when the spill range is blocked |
| **Function library expansion** | 🔵 | Target ≥400 built-in functions across categories: lookup (VLOOKUP/INDEX/MATCH/XLOOKUP), statistical, financial, text, logical, date/time |
| **Conditional formatting** | 🔵 | Per-cell rules driven by the formula engine; rule editor in the column tool panel |
| **Schema introspection** | 🔵 | Auto-derive `ColumnDef[]` from a database/ORM schema |
| `@onegrid/migrate` CLI | ✅ | jscodeshift-based codemod with AG-Grid + TanStack transformers, golden-file fixtures, `--write` / `--dry-run` modes; ambiguous translations get inline TODO comments. Source mappings carry SOURCE: <public-url> provenance per the clean-room rule. |
| **MCP server for the grid** | 🟣 | Expose read/write/range/formula tools over the Model Context Protocol so LLMs can drive the grid as a first-class peer |
| **DBSP-style derived view registration** | 🔵 | Public `defineView({ from, where, groupBy, agg })` API returning a live RowSource backed by incremental view maintenance |
| **Salsa-style reactivity substrate** | 🔵 | On-demand memoization framework backing the formula engine, derived views, and the column tool panel — same pattern as `salsa-rs` |
| Accessibility conformance suite (CI-gated) | ✅ | `@onegrid/a11y` package + `aria-activedescendant` + 4 axe-core/WAI-ARIA Playwright specs in CI |
| **Per-feature bundle slicing** | 🔵 | `bundle-budget.json` per package; CI fails on regressions so adopters can predict the cost of every feature flag |
| **Range navigation history** | 🔵 | Browser-style back/forward stack within huge sheets — surprisingly absent across the field |

## 6. Sequencing

A suggested release plan that interleaves parity work with moat work, so
each release lands a noticeable surface improvement *and* a hard-to-copy
capability.

### v0.0.6 — "actually editable"

Polish on what just shipped + the editing experience users expect.
Detailed implementation patterns (architecture, edge cases, test
strategy, code surface, citations) are in
**[docs/v0.0.6.md](docs/v0.0.6.md)**.

Implementation order — each item builds on the previous so the
critical path is *not* the order they appeared in the original
roadmap; it's the order in which retrofits would be most painful:

1. **Accessibility conformance suite (CI-gated)** — first, because
   ARIA grid semantics (`aria-rowindex`/`aria-colindex`/
   `aria-activedescendant`) underlie every other surface and are
   nearly impossible to retrofit later.
2. **IME composition-aware editor commit** — second, because the
   editor depends on it; `keyCode === 229` paths are silent in
   English-locale CI and surface only in CJKT production use.
3. **Cell editor validation (sync + async)** — sits on top of (1)
   and (2); reuses the live-region work from the a11y suite.
4. **Custom cell renderers (React/Vue/Svelte/Solid pool)** — once
   editing is stable. The renderer pool is the most complex non-a11y
   subsystem; deferring lets adapter teams parallelise.
5. **Tooltip system** — depends on a11y `aria-describedby` plumbing
   and is needed by validation error UI.
6. **Floating filters** + **Set filter** — paired; the toolbar a11y
   plumbing is shared, and set-filter UX needs the floating row to
   live in.
7. **Editor variants** (dropdown, date picker, large text,
   autocomplete, multi-select chips) — composes onto the validated
   editor pipeline.
8. **`@onegrid/migrate` CLI** — last. Migration value is proportional
   to API stability; shipping it before 1–7 settle would force the
   migrator to rewrite itself.

Side-quests that ship anywhere in v0.0.6 (no ordering dependency):
- Header text wrap
- Light theme + density variants
- Loading / no-rows / skeleton overlays
- Schema introspection helper for adapters

### v0.0.7 — "hierarchical"

Tree data + nested grids = the "inner tables" milestone.

Implementation order (critical path — hardest-to-retrofit first, same
principle that drove v0.0.6 sequencing):

1. ✅ **Tree data with lazy-load children** — `flattenTree` /
   `RowTreeMeta` row model in `@onegrid/data` + a `getRowMeta`
   discriminated-union extension in core.
2. ✅ **Nested grids inside detail panels** — `Grid.onDetailUnmount`
   lifecycle hook, recursive `Grid` inside `getDetailContent`, full
   destroy() on collapse / scroll-out / outer destroy.
3. ✅ **Server-side tree expansion** — `BlockRequest.parentId` +
   per-row `HierarchyEntry`, `createSsrmTreeSource` lazy children
   fetcher, mock-server hierarchical dataset.
4. ✅ **Drag-drop reorder** (columns) — header pointerdown →
   drag-candidate → vertical drop indicator → in-place column
   splice + `onColumnReorder` callback. Click-vs-drag disambiguated
   at the 6px threshold. (Row + tree/group reorder is a v0.0.8
   follow-up.)
5. ✅ **Column tool panel / sidebar** — `<ColumnToolPanel>` React
   component with show/hide checkboxes + within-panel drag-drop;
   `Grid.setColumns()` / `Grid.getColumns()` imperative API.
6. ✅ **Context menu** — `ContextMenuTarget` discriminated union
   (cell / header / empty), native menu suppressed, consumer renders
   their own popover.
7. ✅ **Sticky group rows + aggregation-aware group-row pin** —
   `drawStickyGroupRow` re-renders the topmost ancestor group at
   the data band top when scrolled past, with aggregates intact.
8. ✅ **Range fill-handle** — bottom-right handle, dashed-outline
   drag preview, `onFillHandle(source, fill)` callback so the
   consumer applies the data policy.
9. ✅ **Selection checkbox column** — `createSelectionCheckboxColumn`
   factory + `<SelectAllCheckbox>` tri-state widget; renderer-pool
   cells subscribe to a module-scoped store via
   `useSyncExternalStore` so toggles repaint without a Grid remount.

Side-quests with no ordering dependency (ship anywhere in v0.0.7):
- Aggregation-aware group-row pin tuning
- Tree-aware drag-drop polish (constrained-to-same-parent reorder)
- Recursive grouping + pivot mix experiments

### v0.0.8 — "data infrastructure"  ✅ **Shipped**

Lean into the database moat. Detailed implementation patterns are in
**`docs/v0.0.8.md`** (post-hoc).

Implementation order (critical path — same hardest-to-retrofit-first
principle that drove v0.0.6 and v0.0.7 sequencing). The first six items
are *protocol* additions that must lock before any real database
adapter ships; otherwise every adapter would inherit the wrong
protocol and force a v0.0.8.1 break:

1. ✅ **Keyset/cursor canonicalization in SSRM** — first, because every
   real database adapter needs to materialize cursors and we don't
   want offset-style cursors leaking into the production protocol.
   Make compound `(sortValues, rowId)` keyset cursors the canonical
   shape; document offset as legacy. Existing `KeysetCursor` type in
   `@onegrid/protocol` becomes the wire-default.
2. ✅ **Aggregation-pushdown protocol** — `BlockRequest.aggregations`
   landed; servers emit one row per group with the alias columns +
   `__count__`. Mock server demonstrates the path; the five real
   adapters below all support it.
3. ✅ **Real-time row diff protocol** — `RowDiff { kind, version,
   pkey, fields? }` plus `ResyncRequest` / `ResyncResponse` with the
   `snapshot: true` fallback for unrecoverable gaps. Client-side
   `RowDiffTracker` does monotonic-version gap detection.
4. ✅ **Universal CDC adapter shape** — `CdcAdapter` interface +
   `createRowDiffStream` in `@onegrid/ssrm`; composes the tracker
   with any adapter that exposes `subscribe` + `resync` + `close?`.
5. ✅ **Optimistic mutations + conflict resolution** —
   `createOptimisticMutator` orchestrates the apply→submit→commit/
   rollback lifecycle with `onCommit` / `onRollback` /
   `onTransportError`; tracks pending by clientId.
6. ✅ **Arrow IPC ingestion** — `ArrowDecoder` hook on row + tree
   sources; HTTP transport sniffs `Content-Type:
   application/vnd.apache.arrow.stream` and returns
   `BlockResponse<'arrow-ipc'>` with cursors carried via response
   headers.
7. ✅ **Raw Postgres adapter** — `@onegrid/postgres`. Pure SQL
   compiler (35 unit tests against fake `pg`) + LISTEN/NOTIFY CDC
   against an outbox table. README documents the trigger DDL.
8. ✅ **MySQL adapter** — `@onegrid/mysql`. Same compiler shape,
   four documented divergences (backticks, `?` placeholders,
   emulated NULLS handling, `BINARY` for case-sensitive). Polling-
   based CDC since MySQL has no LISTEN/NOTIFY equivalent.
9. ✅ **SQLite adapter** — `@onegrid/sqlite`. Works with better-
   sqlite3 / node:sqlite / bun:sqlite / Cloudflare D1 / libsql via
   one queryable interface (sync OR async returns).
10. ✅ **ClickHouse adapter** — `@onegrid/clickhouse`. Native
    `{p0:Type}` named-parameter syntax; JSONEachRow + Arrow IPC
    response paths.
11. ✅ **MongoDB adapter** — `@onegrid/mongo`. find / aggregation
    pipeline; change-streams CDC with resume tokens; keyset
    pagination expands to chained `$or` mirroring SQL row-tuple
    comparison.
12. ✅ **Schema introspection helper** — `@onegrid/introspect`.
    `columnsFromSchema`, `schemaFromSqlRows`, `schemaFromSqliteRows`,
    `columnTypeFromSql`. ORM-specific (Drizzle / Prisma) follows in
    v0.0.9.

Side-quests with no ordering dependency (ship anywhere in v0.0.8):
- Row-level security / column permissions (declarative, server-enforced)
- Snowflake adapter, BigQuery adapter, Elasticsearch adapter, Prisma adapter

### v0.0.9 — "performance"
Push the ceiling above what commercial grids can hit.
- DBSP-grounded operator algebra spec (prerequisite for differential dataflow)
- Web Worker offload for sort/filter/group/pivot, with worker-pool budget controller
- Column virtualization
- Differential dataflow updates
- Incremental redraw with dirty-rect protocol
- Adaptive overscan
- BigInt-safe formula path
- Range chart + sparklines

### v0.0.10 — "moats"
The signature features that aren't on any other grid.
- Live ORM sync (Drizzle/Kysely/Prisma)
- Collaborative real-time editing (Yjs/Automerge)
- Time-travel / temporal data
- Plugin / extension API
- AI integration (filters/sorts/formulas from natural language)
- MCP server for the grid (LLMs read/write through standardized tools)
- Salsa-style reactivity substrate refactor

### v0.1.0 — "WebGPU rendering"
The flagship moonshot.
- MSDF glyph atlas (the lower-risk path, ports cleanly from the public WebGPU MSDF sample)
- Slug-style per-curve quadratic Bézier text (atlas-free fallback for arbitrarily-large zoom)
- Per-cell vertex buffer pipeline
- GPU hash-aggregate compute kernel for group-by
- Compute-shader sort/filter at viewport scale
- Cross-database joins via DuckDB-WASM in the same render frame

### v1.0.0 — "stable"
Surface freeze, full a11y audit, every adapter promoted from
experimental, semver guarantees, security review.

---

## Research foundations

Several roadmap entries lean on published research and standards. These
are public academic / standards references, not third-party
implementations — oneGrid will reimplement everything from the public
descriptions, never from any commercial source.

- **Adapton (Hammer et al., PLDI 2014)** — demand-driven self-adjusting
  computation. Already underpins the formula engine; will be extended to
  derived views (groupings, pivots, filters) as first-class observers.
  → `@onegrid/formula`, plus a planned `@onegrid/derived` package.
- **DBSP (Budiu et al., VLDB 2023)** — generalized incremental view
  maintenance. The principled foundation for the "differential dataflow"
  roadmap entry.
  → `@onegrid/ssrm` block-cache invalidation + a planned `@onegrid/dbsp`
  operator engine.
- **Differential Dataflow (McSherry et al., CIDR 2013)** — the
  computation model DBSP formalizes; useful for multi-version timestamping
  when grid edits race against server pushes.
- **Noria (Gjengset et al., OSDI 2018)** — partially-stateful dataflow
  for read-heavy apps. Shape for an SSRM mode that asks the server to
  materialize only the visible viewport's state.
- **salsa-rs** — Rust on-demand memoization framework used by
  rust-analyzer. Target for a TS port as the reactivity substrate
  beneath the formula engine, derived columns, and the column tool panel.
- **HyperFormula range decomposition** — share work across overlapping
  aggregates by splitting `A1:A100` into `A1:A99 ∪ A100`. The signature
  technique behind the "linear range decomposition" roadmap entry.
- **Apache Arrow Flight** — gRPC + Arrow record batches as wire format
  with parallel transfer. The standard oneGrid will adopt for any
  high-throughput data adapter.
- **MSDF / Slug glyph rendering** — multi-channel signed distance fields
  (atlas-based) and per-curve quadratic Bézier evaluation (atlas-free)
  as the two-phase path for the WebGPU text pipeline.
- **WAI-ARIA 1.2 grid pattern** — the standards-conformance target the
  accessibility CI suite gates against.
- **Yjs (YATA) and Automerge** — the two CRDT lineages the
  collaborative-editing layer will offer as pluggable backends.

---

## How to propose a change

1. Open an issue with the feature, the use case it unlocks, and the
   category it belongs to.
2. If the design is non-trivial, sketch a short RFC in the issue —
   protocol additions, render hooks, performance budget.
3. Check that nothing in [CONTRIBUTING.md](CONTRIBUTING.md)'s
   architectural guardrails would be violated.
4. Once accepted, the issue moves to "🔵 Planned" status here.

oneGrid will not cut scope on this list. If a feature is on the roadmap,
it ships.
