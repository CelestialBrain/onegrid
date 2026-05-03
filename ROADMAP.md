# oneGrid Roadmap

The full list of work that gets oneGrid from a credible v0.0.5 grid to the
most capable open-source grid in the JavaScript ecosystem. Items are
grouped by where they create leverage, not by release order — see
"Sequencing" at the bottom for milestone framing.

**Last updated:** 2026-05-04

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
| **Tree data** | 🔵 | Hierarchical row model, parent→child in the data itself |
| **Set filter** | 🔵 | Distinct-values checkbox filter with counts |
| **Floating filters** | 🔵 | Per-column inline filter row under the header |
| **Column tool panel / sidebar** | 🔵 | Drag-drop visibility, reorder, group/pivot/value drop zones |
| **Context menu** | 🔵 | Right-click → copy/paste/export/filter/group |
| **Drag-drop column reorder** | 🔵 | |
| **Drag-drop row reorder** | 🔵 | |
| **Row + column span (merged cells)** | 🔵 | |
| **Sticky group rows** | 🔵 | Group header pins while scrolling within |
| **Loading / no-rows / skeleton overlays** | 🔵 | |
| **Tooltip system** | 🔵 | Per-cell + per-header |
| **Custom cell renderers** | 🔵 | React/Vue/Svelte/Solid component-per-cell, frame-rate-aware |
| **Editor variants** | 🔵 | Dropdown, date picker, large text, custom editors |
| **Selection checkbox column** | 🔵 | |
| **Range chart** | 🔵 | Select cells → embed a chart bound to the selection |
| **Sparklines in cells** | 🔵 | |
| **Undo/redo** | 🔵 | Transactional edit history |
| **Light theme + density variants** | 🔵 | Currently one dark theme |

## 2. Performance

Where commercial grids have soft ceilings. These are the wins that show up
on benchmark charts.

| Feature | Status | Notes |
|---|---|---|
| Velocity-aware overscan | ✅ | Basic — needs adaptive tuning |
| GPU compute kernels (parallel reduce + filter mask) | ✅ | `@onegrid/webgpu` |
| **Column virtualization** | 🔵 | For 500+ column grids |
| **Web Worker offload** | 🔵 | Sort/filter/group/pivot off the main thread |
| **Full WebGPU rendering path** | 🟣 | Canvas replacement: glyph atlas, SDF text, per-cell vertex buffers |
| **Arrow IPC ingestion** | 🔵 | Zero-copy from server, streaming |
| **Differential dataflow** | 🟣 | Source change → recompute only affected derived views |
| **Incremental redraw** | 🟣 | Paint only cells that changed since last frame |
| **SharedArrayBuffer for cross-thread viewport** | 🟣 | |
| **Adaptive overscan** | 🔵 | Velocity-aware tuning that learns from real fling traces |

## 3. Hierarchy & nesting

The "inner tables" axis: data and UI that nest cleanly.

| Feature | Status | Notes |
|---|---|---|
| Master-detail expandable rows | ✅ | |
| Row grouping (aggregation-driven, not data-driven) | ✅ | |
| **Tree data with lazy-load children** | 🔵 | Server fetches children at depth N on demand |
| **Nested grids inside detail panels** | 🔵 | Recursive oneGrid-in-oneGrid with focus + scroll containment |
| **Server-side tree** | 🔵 | Push tree expansion + lazy children to the server, same DataSource shape |
| **Recursive grouping + pivot mix** | 🔵 | Tree data with pivot columns at leaf level |

## 4. Database + data infrastructure

The consolidation moat. oneGrid is positioned to own the database edge in
ways commercial grids are structurally bad at.

| Feature | Status | Notes |
|---|---|---|
| Server-side row model (cursor + block cache) | ✅ | |
| Drizzle adapter | ✅ | |
| Kysely adapter | ✅ | |
| DuckDB-WASM as backing engine | ✅ | |
| **Raw Postgres adapter** | 🔵 | `postgres`/`pg` driver; LISTEN/NOTIFY for live updates |
| **MySQL adapter** | 🔵 | |
| **SQLite adapter** | 🔵 | Local + Bun + Cloudflare D1 |
| **Snowflake adapter** | 🔵 | |
| **BigQuery adapter** | 🔵 | |
| **ClickHouse adapter** | 🔵 | Native HTTP + columnar push |
| **MongoDB adapter** | 🔵 | Change streams for live updates |
| **Elasticsearch adapter** | 🔵 | |
| **Prisma adapter** | 🔵 | |
| **Live updates / subscriptions** | 🔵 | Postgres LISTEN/NOTIFY, Mongo change streams, WebSocket fan-out |
| **Optimistic mutations + conflict resolution** | 🟡 | Scaffolded in SSRM; needs real impl |
| **Row-level security / column permissions** | 🔵 | Declarative, server-enforced |
| **Cross-database joins via DuckDB-WASM** | 🟣 | Remote Postgres + local Parquet + CSV, joined in-browser |
| **Query builder UI** | 🟣 | Build SQL/Mongo queries through the grid UI itself, anchored on the column tool panel |

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
| **Array formulas / dynamic arrays** | 🔵 | |
| **Function library expansion** | 🔵 | VLOOKUP, INDEX, MATCH, statistical, financial, date/time |
| **Conditional formatting** | 🔵 | Per-cell rules driven by the formula engine |
| **Schema introspection** | 🔵 | Auto-derive ColumnDef[] from a database/ORM schema |

## 6. Sequencing

A suggested release plan that interleaves parity work with moat work, so
each release lands a noticeable surface improvement *and* a hard-to-copy
capability.

### v0.0.6 — "actually editable"
Polish on what just shipped + the editing experience users expect.
- Editor variants (dropdown, date picker, large text)
- Custom cell renderers (React/Vue/Svelte/Solid)
- Set filter
- Floating filters
- Light theme + density variants
- Tooltip system
- Loading / no-rows / skeleton overlays
- Schema introspection helper for adapters

### v0.0.7 — "hierarchical"
Tree data + nested grids = the "inner tables" milestone.
- Tree data with lazy-load children
- Nested grids inside detail panels
- Server-side tree expansion
- Sticky group rows
- Drag-drop column reorder
- Column tool panel / sidebar
- Context menu
- Selection checkbox column

### v0.0.8 — "data infrastructure"
Lean into the database moat.
- Raw Postgres adapter with LISTEN/NOTIFY live updates
- MySQL + SQLite adapters
- Optimistic mutations + conflict resolution (real impl)
- Live updates protocol over WebSocket
- Arrow IPC ingestion
- ClickHouse adapter
- MongoDB adapter

### v0.0.9 — "performance"
Push the ceiling above what commercial grids can hit.
- Web Worker offload for sort/filter/group/pivot
- Column virtualization
- Differential dataflow updates
- Incremental redraw
- Adaptive overscan
- Range chart + sparklines

### v0.0.10 — "moats"
The signature features that aren't on any other grid.
- Live ORM sync (Drizzle/Kysely/Prisma)
- Collaborative real-time editing (Yjs/Automerge)
- Time-travel / temporal data
- Plugin / extension API
- AI integration (filters/sorts/formulas from natural language)

### v0.1.0 — "WebGPU rendering"
The flagship moonshot.
- Glyph atlas + SDF text
- Per-cell vertex buffer pipeline
- Compute-shader sort/filter at viewport scale
- Cross-database joins via DuckDB-WASM in the same render frame

### v1.0.0 — "stable"
Surface freeze, full a11y audit, every adapter promoted from
experimental, semver guarantees, security review.

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
