# oneGrid Roadmap

The full list of work that gets oneGrid from a credible v0.0.5 grid to the
most capable open-source grid in the JavaScript ecosystem. Items are
grouped by where they create leverage, not by release order — see
"Sequencing" at the bottom for milestone framing.

**Last updated:** 2026-05-15

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
| **Loading / no-rows / skeleton overlays** | 🔵 | v0.0.9 side-quest — depend on theme tokens (item 2) |
| Tooltip system | ✅ | Single shared `<div role=tooltip>` with hover delay + Escape/scroll dismiss |
| Custom cell renderers | ✅ | Pool + overlay layer in core; React adapter shipped (Vue/Svelte/Solid follow-up) |
| Editor variants | ✅ | `createSelectEditor` / `createDateEditor` / `createTextareaEditor` (autocomplete + multi-select chips follow-up) |
| Selection checkbox column | ✅ | `createSelectionCheckboxColumn` factory + `<SelectAllCheckbox>` tri-state widget; module-scoped store keeps cells in sync via `useSyncExternalStore` |
| **Range chart** | 🔵 | Select cells → embed a chart bound to the selection |
| **Sparklines in cells** | 🔵 | |
| **Undo/redo** | 🔵 | Transactional edit history |
| **Light theme + density variants** | 🔵 | v0.0.9 item 2 — DTCG 2025.10 JSON tokens compiled to CSS variables on `[data-og-root]`; 3 density bundles (compact/comfortable/spacious) |
| IME composition-aware editor commit | ✅ | State machine on composition events + `keyCode===229` guard |
| Cell editor validation | ✅ | Sync + async with `AbortController`; aria-invalid + aria-errormessage + LiveAnnouncer fallback |
| Range fill-handle | ✅ | Bottom-right handle, dashed-outline drag preview, `onFillHandle(source, fill)` callback |
| **Multi-select cell type with chips** | 🔵 | Multi-value column type rendering chips per cell, with a popover editor |
| **Column-group visibility manager** | 🔵 | Toggle whole header groups on/off in one action (single-column visibility ships in `<ColumnToolPanel>`) |
| **Header text wrap** | 🔵 | v0.0.9 side-quest — opt-in wrap with auto-row-height in the header band; tracks density/typography work |
| **Page-level sticky header** | 🔵 | Header sticks to page scroll, not just the grid container — works for grids embedded in long-scroll pages |
| **FDC3 broadcast + intent listener** | 🔵 | Fintech-desk interop: broadcast row context to peer apps, receive intents back |
| **Mobile swipe-row actions** | 🔵 | v0.0.9 item 7 — gesture vocabulary inside `@onegrid/touch` (swipe-left / swipe-right templates) |

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
| **Plugin / extension API** | 🔵 | v0.0.9 item 1 — `@onegrid/plugin-kit` with ten domain-specific facet/extension registries (cellRenderer, cellEditor, exporter, dataSource, theme, formulaFunction, aggregator, filterOperator, columnTool, i18nCatalog) |
| **Embeddable block** | 🟣 | Drop oneGrid into Notion/Coda/Obsidian-style hosts |
| **Linear range decomposition in the formula engine** | 🔵 | Sharing work across overlapping aggregates (A1:A100 → A1:A99 + A100) |
| **Spill-style dynamic arrays** | 🔵 | Excel-365-style spilling formulas with `#SPILL!` errors when the spill range is blocked |
| **Function library expansion** | 🔵 | Target ≥400 built-in functions across categories: lookup (VLOOKUP/INDEX/MATCH/XLOOKUP), statistical, financial, text, logical, date/time |
| **Conditional formatting** | 🔵 | Per-cell rules driven by the formula engine; rule editor in the column tool panel |
| **Schema introspection** | 🔵 | Auto-derive `ColumnDef[]` from a database/ORM schema |
| `@onegrid/migrate` CLI | ✅ | jscodeshift-based codemod with transformers for the major incumbent grid configurations, golden-file fixtures, `--write` / `--dry-run` modes; ambiguous translations get inline TODO comments. Source mappings carry SOURCE: <public-url> provenance per the clean-room rule. |
| **MCP server for the grid** | 🟣 | Expose read/write/range/formula tools over the Model Context Protocol so LLMs can drive the grid as a first-class peer |
| **DBSP-style derived view registration** | 🔵 | Public `defineView({ from, where, groupBy, agg })` API returning a live RowSource backed by incremental view maintenance |
| **Salsa-style reactivity substrate** | 🔵 | v0.0.11 — on-demand memoization framework backing the formula engine, derived views, and the column tool panel; same pattern as `salsa-rs` |
| Accessibility conformance suite (CI-gated) | ✅ | `@onegrid/a11y` package + `aria-activedescendant` + 4 axe-core/WAI-ARIA Playwright specs in CI |
| **Per-feature bundle slicing** | 🔵 | v0.0.9 item 5 — `bundle-budget.json` per package + `size-limit` + esbuild metafile; PR fails on >5% regression unless `[budget-bump:]` justification |
| **Range navigation history** | 🔵 | Browser-style back/forward stack within huge sheets — surprisingly absent across the field |
| **Headless engine contract** | 🔵 | v0.0.9 item 4 — `@onegrid/headless` wraps `Grid` with Lit-`ReactiveController`-shaped lifecycle (`hostConnected`/`hostUpdate`/`hostUpdated`/`hostDisconnected`) + imperative core + `subscribe` for reactive frameworks; SSR via `renderAccessibilityShadowHTML()` |
| **Nested namespaced configuration schema** | 🔵 | v0.0.9 item 3 — `defineGridOptions({ data, columns, selection, editing, ... })` factory + flat→nested codemod + preset helpers; construct-time validation throws named codes |
| **i18n / l10n / RTL** | 🔵 | v0.0.9 item 6 — `@onegrid/intl` with `Intl.Collator` cache, ICU MessageFormat catalogs, BCP 47 validator; CSS logical properties throughout `@onegrid/core/style/*`; `getRtlAwareScrollLeft()` helper |
| **Touch + mobile interaction** | 🔵 | v0.0.9 item 7 — `@onegrid/touch` with Pointer Events bridge, gesture recognizer (tap / long-press / swipe / drag-edge resize), `touch-action` declarations, `overscroll-behavior: contain`, `(pointer: coarse)` density overrides at Apple HIG 44pt floor, VirtualKeyboard API + `visualViewport` fallback |
| **Worker-boundary plugin trust tier** | 🔵 | v0.0.9 item 8 — second trust tier for user-supplied formula functions / aggregators authored over Arrow vectors; structured-clone-friendly `WorkerPlugin` shape with `Transferable` zero-copy |
| **Error boundaries + observability** | 🟣 | v0.0.9 item 9 (research pending) — `onError(err, context)`, error-state cell rendering, structured logs / OpenTelemetry breadcrumbs, framework error-boundary integration |
| **Schema evolution at runtime** | 🟣 | v0.0.9 item 10 (research pending) — selection-by-index vs by-id under column add/remove, sort/filter on a removed column, formula `#REF!` semantics |
| **Row-level security / column permissions** | 🔵 | v0.0.9 item 11 — server-canonical permissions (adapter-level filter on `BlockRequest`) + client-cosmetic UI (hide / disable / read-only per column or row) |
| **Backwards-compat / deprecation policy** | 🟣 | v0.0.9 item 12 (research pending) — stable-vs-experimental tier within a major, deprecation timeline, intra-version migrations via `@onegrid/migrate` |
| **`@onegrid/test` adopter harness** | 🟣 | v0.0.9 item 13 (research pending) — testing recipes for cell editing, SSRM block-fetch waits, jsdom limits + Playwright / vitest browser mode integration |
| **Print + advanced export** | 🟣 | v0.0.9 item 14 (research pending) — PDF (jsPDF / pdf-lib), screenshot, format-preserving spreadsheet export, `@media print` paginated layout, header repetition per page |
| **Cross-cell / row-level / sheet-level validators** | 🟣 | v0.0.9 item 15 (research pending) — composes onto the per-cell validator; reuses the formula engine's Adapton-style invalidation graph; topological-pass cap to break cycles |
| **Compile-time feature opt-in (sub-path exports)** | 🟣 | v0.0.9 item 16 (research pending) — critical features always bundled; optional features (formula engine, WebGPU, pivot, tree) opt-in via explicit imports; `package.json` conditional sub-path exports |
| **Forced-colors / high-contrast support** | 🔵 | v0.0.9 side-quest — `@media (forced-colors: active)` maps tokens to system colors |

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

### v0.0.9 — "extensibility + ergonomics"  ✅ **Items 1–8 shipped**

Systems-design layer. Detailed implementation patterns will land in
**`docs/v0.0.9.md`** as the milestone progresses; the architectural
direction is sourced from a public-source-only systems-design research
report (see "Research foundations" below — the report cites W3C / MDN
/ RFCs / individual engineer writing / open-source design docs from
CodeMirror / ProseMirror / Lit / Vite / ESLint / Floating UI /
FormatJS / DTCG, never any commercial grid library).

Implementation order (critical path — same hardest-to-retrofit-first
principle as v0.0.6 / v0.0.7 / v0.0.8). Items 1–8 are the seven
sections covered in the v0.0.9 research plus a Worker-boundary plugin
follow-up; items 9–16 cover concerns flagged for follow-up research
that will be detailed in `docs/v0.0.9.md` once their architecture is
settled.

1. **Plugin / extension API** — `@onegrid/plugin-kit` with ten
   domain-specific registries (cellRenderer, cellEditor, exporter,
   dataSource, theme, formulaFunction, aggregator, filterOperator,
   columnTool, i18nCatalog). CodeMirror-6-style facet/extension
   shape with explicit precedence, automatic deduplication, hot-
   reconfigure via `Compartment`, typed `interfaceVersion` for
   plugin/core compatibility, narrowed `PluginContext` (no raw
   DOM/canvas access). Tree-shake-friendly: each registry is a
   separate module path under `@onegrid/core/plugins/*`. Ships
   first because themes, i18n catalogs, aggregators, and filter
   operators all register through it.
2. **Theme + density system** — `@onegrid/tokens` ships W3C DTCG
   2025.10 JSON compiled to CSS custom properties scoped to
   `[data-og-root]`. `[data-og-theme]` + `[data-og-density]`
   attribute selectors give per-instance theming + 3 density
   bundles (compact / comfortable / spacious). `MediaQueryList`
   watcher with cleanup drives `prefers-color-scheme: auto`.
   Comprehensive token taxonomy (≈30 color tokens covering
   bg/header/pinned/sticky/hover/selection/focus/borders/text/
   scrollbar/chevron/detail-panel/status-bar/floating-filter/
   tooltip/drag-indicator/validation/aggregation/pivot/context-
   menu, ≈15 density tokens covering row/header/detail heights +
   font sizes + padding + border thickness + chevron/checkbox/
   resize-handle sizes + line heights). Forced-colors media query
   maps tokens to system colors for high-contrast.
3. **Configuration schema migration** — flat `GridOptions` →
   nested namespaces (`{ data, columns, selection, editing,
   sorting, filtering, grouping, pivot, rendering, scrolling,
   a11y, i18n, touch, ssrm, formula, plugins }`). `defineGridOptions()`
   factory accepts both shapes; flat fields trigger a one-time
   `[OG_DEPRECATED_FLAT_OPT]` warning + auto-hoist.
   `@onegrid/migrate` gains a `--from-flat-options` codemod.
   Preset helpers (`editingPreset`, `mobilePreset`,
   `enterprisePreset`, `accessibilityPreset`) compose via spread.
   Construct-time validation throws with named codes
   (`OG_INVALID_OPTION`, `OG_OPT_REQUIRES`, `OG_OPT_CONFLICT`,
   `OG_OPT_UNKNOWN_NAMESPACE`, `OG_I18N_INVALID_LOCALE`).
4. **Headless contract** — `@onegrid/headless` published as a
   separate package wrapping `@onegrid/core`'s `Grid` class with
   Lit-`ReactiveController`-shaped lifecycle (`hostConnected` /
   `hostUpdate` / `hostUpdated` / `hostDisconnected` +
   `requestUpdate`). Imperative surface (`grid.setSort()`,
   `grid.setFilter()`, `grid.setColumns()`, `grid.scrollToRow()`,
   `grid.subscribe(event, fn)`). Single
   `grid.invalidate(reason)` scheduling primitive coalesces work
   into one `requestAnimationFrame`. SSR path:
   `grid.renderAccessibilityShadowHTML()` returns a static HTML
   string from the ARIA shadow (canvas not meaningful in SSR);
   client-side `grid.mount({ hydrateFrom })` adopts existing
   nodes. Reference adapters: vanilla JS, Lit, Solid example apps.
5. **Per-feature bundle budgeting** — `bundle-budget.json` per
   package committed in the repo. CI runs `size-limit` (gating)
   + emits `esbuild --metafile` JSON (diagnosis). PR comment via
   `andresz1/size-limit-action`. Per-feature granularity: each
   feature lives in its own entry point
   (`@onegrid/core/features/tree-data`,
   `@onegrid/core/features/pivot`, etc.); feature cost measured
   as `bundle(core + feature) - bundle(core)`. PR fails if any
   feature exceeds budget by >5% unless description carries
   `[budget-bump: <feature>]` justification. WebGPU + CPU
   fallback both ship → budget the sum, not the max.
6. **i18n / l10n / RTL** — `@onegrid/intl` ships `Intl.*` thin
   wrappers (`formatNumber`, `formatDate`, `formatRelative`,
   `formatList`), cached `Intl.Collator` (`getCollator(locale)`),
   ICU MessageFormat catalog runtime via FormatJS
   (`loadCatalog`, `t(messageId, params)`), BCP 47 validator
   (`Intl.Locale`-backed canonicalization), locale-aware
   number/date parsers (`parseLocalizedNumber` via
   `Intl.NumberFormat({...}).formatToParts`). Full translation
   string enumeration: chevron a11y labels, empty state,
   validation messages, context menu items, column tool panel
   labels, row group footers, aggregation function names, filter
   operator names, status bar, floating filter placeholders,
   drag-drop indicators, pagination, tooltip help text, detail
   panel labels, date picker month/weekday names, AM/PM, week-
   start day, currency. RTL: `dir="rtl"` on the host + CSS
   logical properties throughout (`inset-inline-*`,
   `margin-inline-*`, `border-inline-*`, `padding-inline`).
   `getRtlAwareScrollLeft()` helper abstracts engine-version
   `scrollLeft` quirks. Logical-direction keyboard nav per WAI-
   ARIA grid pattern. Mixed-direction content via `<bdi>` /
   `unicode-bidi: plaintext`.
7. **Mobile + touch interaction** — `@onegrid/touch` ships
   Pointer Events bridge with `pointercancel` cleanup, gesture
   recognizer (tap, double-tap, long-press ≥500 ms, swipe,
   drag-from-edge resize, drag-header reorder), `touch-action`
   declarations on every affordance (`manipulation` for tappables,
   `none` for drag affordances, `pan-x pan-y` on grid body
   reserving pinch for the OS), `overscroll-behavior: contain`
   on grid body to prevent scroll chaining without disabling
   local rubberband, `(pointer: coarse)` density overrides
   meeting Apple HIG 44pt / Material 48dp floors,
   `--og-density-touch-hit-zone` token, VirtualKeyboard API
   path (`navigator.virtualKeyboard.overlaysContent = true` +
   `geometrychange` listener + `env(keyboard-inset-height, 0px)`)
   with `visualViewport` fallback for iOS Safari, `inputmode`
   on cell editors driven by column data type. Default
   `touch.longPressAction: 'context-menu'` (matches platform
   conventions; opt-in `'row-drag'` for spreadsheet-style apps).
8. **Worker-boundary plugins** — second trust tier for
   user-supplied formula functions and aggregators authored
   over Arrow vectors. Plugin module loads in a dedicated
   Worker; registry exposes a structured-clone-friendly
   `WorkerPlugin` shape. Arrow-vector zero-copy via
   `Transferable` where alignment permits. Errors caught in
   the postMessage adapter, surfaced as `{ ok: false, error }`
   without crashing the main thread. Iframe sandboxing
   intentionally NOT offered — too much overhead for hot paths.
9. **Error boundaries + observability** — research pending. A
   renderer / formatter / validator throwing must not crash the
   grid; error policy + recovery surface (`onError(err, context)`,
   error-state cell rendering, React error-boundary integration,
   structured logs / OpenTelemetry breadcrumbs) to be detailed
   in `docs/v0.0.9.md` once researched.
10. **Schema evolution at runtime** — research pending. When a
    database column is added or removed mid-session, what does the
    grid do? Selection-by-index vs by-id, sort/filter on a removed
    column, formula `#REF!` semantics, breaking-change-detection
    for `Grid.setColumns(...)`.
11. **Multi-tenancy / RLS / column permissions** — research
    pending. Server-canonical permissions (adapter-level filter on
    `BlockRequest`), client-cosmetic UI (hide / disable / read-only
    per column or row), permission-aware
    `getColumnVector(colId)` returning `undefined` instead of
    throwing.
12. **Backwards-compat / deprecation policy** — research pending.
    Stable-vs-experimental tier within a major, deprecation
    timeline (warn-for-N-minor-versions before removal),
    `@deprecated` JSDoc + console.warn + ESLint rule, intra-version
    migrations via `@onegrid/migrate`.
13. **Adopter testing harness** — research pending. `@onegrid/test`
    package or documented testing recipes — assert "row 5 column 3
    contains 'X'", drive cell editing in tests, wait for SSRM
    blocks, jsdom limits (no canvas), Playwright / vitest browser
    mode integration recipes.
14. **Print / advanced export** — research pending. PDF (jsPDF /
    pdf-lib), screenshot, format-preserving Excel, `@media print`
    paginated layout, header repetition per page,
    `print-color-adjust`.
15. **Validation system extensibility** — research pending.
    Cross-cell / row-level / sheet-level validators composing on
    top of the per-cell validator. Adapton-style invalidation graph
    reuse (the formula engine already has one). Topological-pass
    cap to prevent cycles.
16. **Runtime feature flags vs compile-time tree-shaking** —
    research pending. Critical features always bundled (renderer,
    selection); optional features (formula engine, WebGPU, pivot,
    tree) opt-in via explicit imports. Conditional sub-path
    exports in `package.json`.

Side-quests with no ordering dependency (ship anywhere in v0.0.9):
- Light theme as a first-class DTCG token bundle (lands inside item 2)
- A11y forced-colors mode (lands inside item 2)
- Header text wrap (had no home; tracks the density/typography work)
- Loading / no-rows / skeleton overlays (depend on theme tokens)

### v0.0.10 — "performance" (was v0.0.9)  ✅ **Shipped**

Push the ceiling above what commercial grids can hit.
- DBSP-grounded operator algebra spec (prerequisite for differential dataflow)
- Web Worker offload for sort/filter/group/pivot, with worker-pool budget controller
- Column virtualization
- Differential dataflow updates
- Incremental redraw with dirty-rect protocol
- Adaptive overscan
- BigInt-safe formula path
- Range chart + sparklines

### v0.0.11 — "moats" (was v0.0.10)  ✅ **Shipped**

The signature features that aren't on any other grid.
- Live ORM sync (Drizzle/Kysely/Prisma)
- Collaborative real-time editing (Yjs/Automerge)
- Time-travel / temporal data
- AI integration (filters/sorts/formulas from natural language)
- MCP server for the grid (LLMs read/write through standardized tools)
- Salsa-style reactivity substrate refactor
  (Plugin / extension API moved to v0.0.9 item 1.)

### v0.1.0 — "WebGPU rendering"  ✅ **Shipped (scaffold + protocol; renderer migration in v0.1.0.x)**
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

### v1.1.0 — "spreadsheet-grade compat"

Excel/Sheets-grade formula coverage. v0.0.5–v1.0 ships a working
Adapton-based formula engine with ~41 functions covering the common
arithmetic / aggregation / text / date / logical set; v1.1 brings the
function library and the structural semantics to feature parity with
Excel's published behavior. Public source only — Microsoft's published
function documentation and the OOXML spec (ECMA-376) for the wire
shape; never any proprietary engine source.

Function library — ~460 additional functions across nine groups:

- **Lookup / reference** (~15) — VLOOKUP, HLOOKUP, XLOOKUP, INDEX,
  MATCH, OFFSET, INDIRECT, CHOOSE, FILTER, SORT, UNIQUE, SEQUENCE,
  LET, LAMBDA, MAP
- **Statistical** (~80) — MEDIAN, MODE family, STDEV* / VAR*,
  PERCENTILE* / QUARTILE*, RANK*, COUNTIF* / AVERAGEIF* / SUMIF*,
  regression family (SLOPE, INTERCEPT, RSQ, FORECAST*, LINEST,
  TREND), distribution functions (NORM*, T*, CHISQ*, BINOM*, POISSON,
  WEIBULL, GAMMA*)
- **Financial** (~55) — NPV, IRR, MIRR, PMT, FV, PV, RATE, NPER, the
  depreciation family (SLN, SYD, DDB, VDB), bond math (PRICE,
  YIELD, DURATION, MDURATION, ACCRINT, COUPNUM)
- **Date / time** (~25) — DATEDIF, NETWORKDAYS / NETWORKDAYS.INTL,
  WORKDAY / WORKDAY.INTL, EOMONTH, EDATE, WEEKNUM with all 11 week
  bases, ISOWEEKNUM, YEARFRAC with all 5 basis modes
- **Text** (~30) — TEXTSPLIT, TEXTJOIN, TEXTBEFORE / TEXTAFTER,
  the new REGEX* family (REGEXTEST, REGEXEXTRACT, REGEXREPLACE),
  PROPER, CLEAN, EXACT, T, VALUE, NUMBERVALUE, CHAR / CODE /
  UNICHAR / UNICODE, DOLLAR / FIXED
- **Math** (~60) — LOG family, full trig (SIN/COS/TAN/A* and
  hyperbolic), matrix ops (MMULT, MINVERSE, MDETERM, MUNIT),
  GCD / LCM, COMBIN / COMBINA / PERMUT / PERMUTATIONA, ROMAN /
  ARABIC, SIGN, modular arithmetic, RAND / RANDBETWEEN /
  RANDARRAY
- **Logical** (~10) — IFS, SWITCH, XOR, LET, BYROW, BYCOL,
  REDUCE, SCAN, MAKEARRAY
- **Engineering** (~50) — BIN2HEX / HEX2BIN / DEC2BIN / OCT2*
  family, BITAND / BITOR / BITXOR / BITLSHIFT / BITRSHIFT,
  Bessel functions (BESSELI / J / K / Y), complex number math
  (COMPLEX, IMABS, IMSUM, IMAGINARY, IMREAL, IMARGUMENT,
  IMCONJUGATE, IMEXP, IMLN, IMLOG10, IMSQRT, IMPOWER, IMPRODUCT,
  IMDIV, IMSUB), error functions (ERF / ERFC), unit conversion
  (CONVERT with all unit groups)
- **Database / cube / web** (~50) — DGET, DSUM, DAVERAGE,
  DCOUNT*, DMAX, DMIN, DPRODUCT, DSTDEV*, DVAR*, CUBEMEMBER,
  CUBEVALUE, CUBESET, CUBEFIELD, CUBEKPIMEMBER (subset behind
  optional sub-path; many require OLAP connectivity), WEBSERVICE,
  FILTERXML, ENCODEURL, HYPERLINK

Structural semantics (the bigger lift than function count):

- **Dynamic arrays + spilling** — single-formula multi-cell output,
  `#` spilled-range operator, implicit-intersection `@` operator
  introduced in Excel 2019. Requires evaluator refactor — the
  current single-cell model isn't enough.
- **Structured table references** — `Table1[#Headers]`,
  `Table1[@Column]`, `Table1[[#All],[Column]]` syntax + parser
  hooks.
- **Named ranges with workbook / sheet scope** — name resolution
  before A1 resolution, scope shadowing rules.
- **R1C1 vs A1 reference modes** — switchable at workbook level;
  relative references in R1C1 use `R[1]C[-1]`-style brackets.
- **Mixed / absolute references** — `$A$1`, `A$1`, `$A1` mode
  combinations and how copy-paste shifts them.

Excel-compatibility bug-list (matching exact behavior so adopters'
existing spreadsheets evaluate the same number):

- **1900 leap year bug** — Excel treats 1900 as a leap year for
  Lotus 1-2-3 compatibility; serial number 60 maps to a non-
  existent date. Match the bug; let opt-out via
  `formula.dateSystem: '1904'` (Mac mode) or
  `'1900-strict'` (no bug — breaks .xlsx round-trip).
- **DATE serial number epoch** — 1900-01-01 = 1 in 1900 mode,
  1904-01-01 = 0 in 1904 mode.
- **Float-precision display rules** — Excel rounds at the cell
  level to suppress `0.1 + 0.2 = 0.30000000000000004`; document
  exact threshold and match.
- **Operator precedence edge cases** — `-2^2 = -4` in Excel
  (unary minus binds tighter than `^`); standard math says +4.
  Decision: match Excel; document the divergence from
  mathematical convention.
- **Empty-cell vs zero coercion** — empty cell is 0 in arithmetic,
  "" in text, FALSE in logical, but `ISBLANK` distinguishes.
- **Error propagation order** — `#NULL!` < `#DIV/0!` < `#VALUE!`
  < `#REF!` < `#NAME?` < `#NUM!` < `#N/A`. First error wins
  unless wrapped in IFERROR / IFNA.
- **Implicit intersection `@`** — pre-2019 Excel implicitly
  intersected ranges with the formula's row; modern Excel requires
  the explicit `@` operator. Both modes opt-in via
  `formula.implicitIntersection`.
- **Circular references** — opt-in iterative calculation
  (`formula.iteration: { max: 100, epsilon: 0.001 }`); without
  it, return `#REF!` and stop.
- **Locale-aware decimal / list separators** — `;` vs `,` for
  function arguments, `,` vs `.` for decimals. Driven by the
  v0.0.9 i18n locale.
- **Text-as-number coercion** — `"5" + 3 = 8` in Excel; `"5x" + 3
  = #VALUE!`. Match exactly.
- **Boolean ↔ 0/1 promotion** — TRUE + 1 = 2; SUM(TRUE, FALSE) = 1.
- **ROUND vs ROUNDDOWN vs INT vs TRUNC sign-handling** —
  `INT(-2.5) = -3` (rounds toward negative infinity);
  `TRUNC(-2.5) = -2` (rounds toward zero); document each.
- **Operator precedence table** — full table matching ECMA-376
  §18.17 precedence ordering.

Test strategy: a public corpus of Excel-formula behavior tests
(adapted from public spreadsheet-engine projects' OWN test
suites — never from proprietary Excel source). Each test
includes the formula, expected value, expected error code if
any, and the OOXML reference. Coverage gate: 95% of corpus
green before v1.1 ships.

OOXML interop: `@onegrid/xlsx` (new package) — read .xlsx
formulas from a workbook, parse to oneGrid's AST, write back.
SheetJS-style approach; pure parser, no proprietary dependencies.

Ships behind sub-path imports so adopters who only need the
v1.0 41-function set don't pay the bundle cost:

```ts
import '@onegrid/formula';                     // 41 base functions
import '@onegrid/formula/excel-compat';        // +460 functions
import '@onegrid/formula/excel-compat/financial';  // just the finance subset
```

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
- **CodeMirror 6 facets / extensions** (Marijn Haverbeke,
  https://marijnhaverbeke.nl/blog/facets.html) — labeled
  composable extension points with explicit precedence and
  deduplication. The plugin/registry shape oneGrid adopts in
  v0.0.9 item 1 (`@onegrid/plugin-kit`).
- **Lit `ReactiveController`** (https://lit.dev/docs/composition/controllers/)
  — minimal lifecycle vocabulary (`hostConnected` / `hostUpdate` /
  `hostUpdated` / `hostDisconnected` + `requestUpdate`) the
  framework-agnostic headless contract uses in v0.0.9 item 4
  (`@onegrid/headless`).
- **W3C Design Tokens Format Module 2025.10**
  (https://www.designtokens.org/tr/drafts/format/) — the JSON
  shape for design tokens (`$value` / `$type` / `$description` +
  alias resolution). Compiled to CSS variables for v0.0.9 item 2
  (`@onegrid/tokens`). First stable version was published
  2025-10-28
  (https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/).
- **ICU MessageFormat + CLDR** (https://formatjs.github.io/docs/intl-messageformat/,
  https://cldr.unicode.org/) — translation message syntax with
  plural/select/gendered forms. The runtime under v0.0.9 item 6
  (`@onegrid/intl`).
- **W3C Pointer Events Level 3** (https://www.w3.org/TR/pointerevents3/)
  + **CSS `touch-action`** + **CSS `overscroll-behavior`** +
  **VirtualKeyboard API** (https://www.w3.org/TR/virtual-keyboard/) —
  the four-property CSS surface plus three-API JS surface that
  v0.0.9 item 7 (`@onegrid/touch`) builds on.
- **ESLint flat config + Vite `defineConfig`** — the typed-factory
  + nested-namespaces shape that v0.0.9 item 3 adopts for
  `defineGridOptions()`.

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
