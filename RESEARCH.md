# oneGrid: Architectural Research Report

> **Scope:** A framework-agnostic, open-source data grid targeting 10M+ rows with server-side row models, formulas, hierarchical grouping, pivoting, and streaming. Research was conducted May 2026 against documentation, source code, papers, and engineering blogs from 2023–2026 with seminal pre-2023 sources where appropriate.

---

## 1. Executive Summary — Top 5 Architectural Decisions

After surveying every major grid library and the underlying research, these are the five decisions that will most determine oneGrid's success and my recommendations.

1. **Rendering strategy → Hybrid: Canvas (2D) primary, DOM overlays for editors/menus/a11y proxy, with a WebGPU "turbo" path behind a feature flag.** Glide Data Grid, RevGrid, and Quadratic have proven canvas wins decisively above ~50–100k visible cells; AG Grid's DOM virtualisation visibly degrades past 100k rows. WebGPU is not yet ubiquitous (still flagged in Firefox stable as of 2025–2026 and worse on Linux/Safari) but is the path forward for 10M+ scale with compute-shader filter/sort. Pure DOM is a non-starter at oneGrid's target scale; pure WebGL/WebGPU breaks accessibility and text rendering at zoom ≠ 100%. The hybrid pattern (canvas pixels + DOM accessibility tree + DOM overlays) is what Quadratic, Google Sheets canvas, and Glide all converged on.

2. **Core architecture → Framework-agnostic TypeScript engine + thin per-framework adapters, NOT a Web Component.** Web Components have real interop friction with React (event/prop passthrough), SSR limitations, and an empirical performance penalty in benchmarks. TanStack Table's "headless" pattern is closer to right but it conflates state and UI logic. Build a vanilla TS reactive core (signals) and ship `@onegrid/core`, `@onegrid/react`, `@onegrid/vue`, `@onegrid/svelte`, `@onegrid/solid`, `@onegrid/angular`, `@onegrid/wc` adapters. RevoGrid's Web Component approach has caused real friction; AG Grid's framework-specific renderers have caused performance regressions (issue #4920).

3. **Data layer → Columnar (Apache Arrow-compatible Struct-of-Arrays) memory layout, with DuckDB-WASM as an optional-but-recommended client-side query engine.** Row-of-objects (the AG Grid/TanStack default) is the silent killer at 10M rows: memory bloat, GC pressure, and zero SIMD potential. Arrow's SoA layout enables typed-array pooling, cheap zero-copy slicing for virtualisation, and direct piping from DuckDB-WASM, Polars, or Arrow Flight. DuckDB-WASM benchmarks at VLDB 2022 show 10–100× over JS-only libraries (Arquero, Lovefield) on TPC-H.

4. **Reactivity & dependency tracking → Fine-grained signals for cell-level invalidation; differential dataflow / DBSP-inspired incremental view maintenance for sort/filter/group/aggregate; and a HyperFormula-style topologically-ordered dependency graph for formulas.** A single uniform reactive substrate (signals) drives both UI re-render granularity and the formula engine. This collapses three normally separate subsystems (UI updates, derived view recomputation, formula recalc) into one mental model.

5. **Server-Side Row Model → Block-cache + cursor-pagination + Arrow IPC over WebSocket/SSE, with a richer protocol than AG Grid's offset-based SSRM.** AG Grid SSRM uses startRow/endRow offsets, which fall apart on volatile data (ranks shift between page fetches), are slow at deep offsets, and force the server to re-paginate on every sort/filter change. Use cursor-based ranges (keyset on sort columns) plus a sliding window LRU block cache, optimistic local mutations with server reconciliation, and Arrow-encoded payloads for zero-copy ingestion.

---

## 2. Section-by-Section Findings

### 2.1 Architecture of leading grid libraries (2023–2026)

Source-code-anchored summaries of each.

**AG Grid (v33+, 2024–2026).** DOM-virtualised rendering with row + column virtualisation. Architecture is class-based TypeScript with framework "UI" adapters (React, Angular, Vue) layered over a vanilla core. Modules-based tree-shakeable distribution since v27; v32 reduced bundle ~10–20%, v33 a further ~40% (community grid currently ~301 kB min+gzip per Best of JS / npm metadata; with full package import the practical app-bundle size is ~520 kB gzipped versus ~300 kB if you cherry-pick modules). License: **Community** is MIT, **Enterprise** is commercial — published list price (early-2026 Vendr benchmarks corroborated by AG Grid's own ecommerce page) is roughly **$995–$1,295/dev/yr (Single Application)** and **$1,495–$1,995/dev/yr (Multiple Application)**, subscription only with no perpetual option for current versions. SSRM (server-side row model) is Enterprise-only and is the de facto industry reference; uses `cacheBlockSize` + `maxBlocksInCache` + an offset-based `getRows({startRow, endRow, sortModel, filterModel, groupKeys, pivotCols})` contract. Recurring complaints (GitHub #4920, #7358, #4440, swlh Medium retrospective): React UI renderer regressed perf vs legacy DOM renderer; `setRowData` slow with 4k+ rows even with pagination=10; Chrome tab-memory cap (~4 GB) becomes the wall before the grid does; bundle size growth.

**TanStack Table v8 (2022–2026).** Pure headless library — no DOM, no styling. Framework-agnostic core (`@tanstack/table-core`) with adapters for React, Vue, Solid, Svelte, Qwik. ~10–15 kB tree-shaken. State is largely controlled (you opt in to internal state). Pluggable row-model functions (`getCoreRowModel`, `getSortedRowModel`, `getFilteredRowModel`, `getGroupedRowModel`, `getPaginationRowModel`). No virtualisation — pairs with `@tanstack/virtual`. No formulas, no SSRM, no pivoting beyond grouping. Common complaints (discussion #4019): docs gaps, breaking v7→v8 paradigm shifts, performance "cliff" around 10k rows when consumers naïvely re-render. The headless model is correct in spirit but pushes too much complexity (and too many performance traps) onto users.

**Glide Data Grid (glideapps/glide-data-grid, MIT).** Canvas (2D) renderer with native browser scroll on a transparent over-canvas. Architecture: a single `<canvas>` per data area, lazy `getCellContent([col,row])` callback, custom cell renderers paint via `drawCell`. ~3.6 MB unpacked / ~140 kB gzipped after tree-shaking. Variable row heights, frozen columns, merged cells, and millions of rows scroll at 60 FPS. Accessibility is a known weak point — maintainers explicitly say "none of the primary developers are accessibility users so there are likely flaws". Maintainer Jason Smith's ITNEXT post (the canonical canvas-grid retrospective) explains the trick: a parallel hidden DOM mirror with `aria-rowindex`/`aria-colindex` + popover `<input>` overlays during cell edit. React-only; no first-class server-side row model — purely a "pull" interface.

**Handsontable (commercial) + HyperFormula (open source dual-licensed GPLv3/commercial).** DOM-virtualised grid with a true Excel-like formula engine. HyperFormula (handsontable/hyperformula) is the most fully documented public formula engine on the web: builds a dependency graph (nodes per cell + nodes per range), uses a Chevrotain LL(k) parser, topologically sorts on recompute, and applies clever range-decomposition: `B5:D20` is represented as `B5:D19 + last-row` so associative aggregates (SUM/MAX/COUNT) reuse subgraph results — turning the otherwise O(n²) edge growth from many overlapping ranges into linear. v3.2.0 (2024) removed `Map.size` limits and validates 30M cells. 386+ Excel-compatible functions.

**RevoGrid (revolist/revogrid, MIT).** Stencil-based Web Component (`<revo-grid>`) with framework wrappers auto-generated for React/Vue/Svelte/Angular. DOM virtualisation with "smart row recombination" (re-uses existing DOM nodes on scroll, similar to react-window). Claims millions of cells; in practice it's solid up to ~100k rows. Strong RTL, copy-paste from Excel, plugin-oriented hooks.

**Grid.js (MIT).** Lightweight, framework-agnostic core (~30 kB) with renderer plugins. No virtualisation by default; aimed at simple/medium tables, not at oneGrid's scale.

**Tabulator (MIT, vanilla JS).** Mature, feature-rich, virtual-DOM rendering, modular formatters/editors. Excellent for dashboards up to ~100k rows. No formulas or SSRM in the AG-Grid sense. Often paired with Panel/Holoviz for Python.

**MUI X DataGrid.** React-only. DataGrid (MIT) is the basic tier; **DataGrid Pro** (commercial) adds virtualisation for large datasets and tree data; **DataGrid Premium** adds row grouping and Excel export. Pricing is per-developer, with a 7%/yr nominal increase and a model that requires every front-end dev who touches the codebase to be licensed (relevant for total cost of ownership comparisons).

**Perspective (FINOS, originally JP Morgan).** A C++/Rust streaming query engine compiled to WebAssembly, with Apache Arrow IPC as the wire format and a Custom Element `<perspective-viewer>` UI with a datagrid + 10+ chart plugins. This is the closest existing thing to what oneGrid wants to be at the engine layer, but its UI/UX is dated and React/Vue integration is via Custom Element wrappers.

**Quadratic (quadratichq/quadratic).** A spreadsheet (not a generic grid) but worth studying because it solved many of oneGrid's problems: Rust core compiled to WASM holds the grid state; PixiJS over WebGL renders; a multi-threaded architecture with a Core worker, a Render worker (text layout + vertex buffers), and the main thread for input; SharedArrayBuffer for viewport coordination; "vector tile" plan for infinite-canvas pan/zoom à la Figma.

**Webix Grid, Bryntum, Syncfusion, jqxGrid/Smart.Grid, Kendo.** Commercial, mostly DOM-virtualised. Webix's published initialisation-time benchmarks (~17 ms for 100k rows) are best-in-class for DOM grids; they lose less ground than AG Grid past 100k. Syncfusion publishes documented benchmarks at 100k×12 with sort/filter/group active.

**Recurring complaints across libraries** (synthesised from GitHub issues, Reddit, swlh AG Grid retrospective, TanStack discussions):
- DOM-based grids hit memory/CPU walls between 50k and 200k rows once non-trivial features are enabled.
- Server-side row models are uniformly under-documented; offset-based block fetching breaks under volatile data.
- React rendering integration is a frequent perf regression source (AG Grid #4920).
- Bundle size: enterprise grids creep past 500 kB gzipped in real apps.
- Headless libraries (TanStack) push performance work onto consumers who repeatedly get it wrong.
- Accessibility in canvas grids is universally weak; AG Grid's a11y is OK but degrades when virtualisation kicks in.

### 2.2 Virtualisation and rendering

**State of the art.** Three orthogonal axes: row virtualisation, column virtualisation, and cell-level virtualisation (the last being "we only know what's painted"). For 100k rows, DOM virtualisation à la TanStack Virtual/react-window is sufficient if and only if row content is light and you aggressively use `content-visibility: auto` and minimise per-row React overhead. For 10M rows, DOM is the wrong primitive because (a) browser scroll-bar precision breaks above ~17M pixels of internal scroll height in WebKit/Blink (a real bug Glide and Quadratic both worked around with synthetic scrollbars), (b) React reconciliation at high scroll velocities causes blank-frame "jank", and (c) memory pressure from row recyling is non-trivial.

**DOM vs Canvas vs WebGL vs WebGPU trade-offs.**

| Strategy | Strengths | Weaknesses | Sweet spot |
|---|---|---|---|
| **DOM virt.** | Native a11y, native text rendering, easy editors, CSS theming | Memory/CPU wall ~50–200k rows w/ features; React reconciliation cost; scrollbar precision limits | Up to ~100k rows, simple cells |
| **Canvas 2D** | 60 FPS millions of rows; complete pixel control; consistent across browsers | A11y must be reimplemented (parallel ARIA tree); text rendering ≠ browser; ~50% of CPU spent in `fillText` (Glide post); print/find-in-page broken | 100k–10M rows, custom cell types |
| **WebGL (PixiJS / custom)** | GPU-accelerated text via SDF/MSDF fonts, smooth zoom 1%–1000%, instanced quads for cells | Text quality at sub-pixel scaling; complex render pipeline; bigger initial bundle | Spreadsheet-style infinite pan/zoom (Quadratic, Figma whiteboard) |
| **WebGPU** | Compute shaders for filter/sort/aggregate on GPU; lower CPU overhead; modern API | Browser support: Chrome 113+ stable, Firefox still flagged in stable as of mid-2025, Safari 17.4+; ~65–70% desktop reach; falls back required | Forward-looking; "turbo" path |

Figma (figma.com/blog/figma-rendering-powered-by-webgpu, 2024) shipped WebGPU with WebGL fallback; Quadratic uses PixiJS over WebGL. Both maintain a parallel CPU-side scene graph and only do GPU work for what's actually visible plus a margin.

**Variable row heights.** Two known-good approaches: (a) **Estimated + measured + cached** (TanStack Virtual, react-virtualized's CellMeasurer) — works but has a "shake" on first scroll over unmeasured rows; (b) **Two-pass** with explicit row-height function (`react-window`'s `VariableSizeList.resetAfterIndex`) — fast but requires consumer to know heights. For canvas, you maintain a Fenwick tree (binary-indexed tree) over row heights so that `offsetForRow(i)` and `rowAtOffset(y)` are both O(log n), even for 10M rows with heterogeneous heights. This is the same data structure CodeMirror 6 uses for line heights.

**Sticky/frozen columns and rows.** In DOM, `position: sticky` works but composites poorly past ~5 sticky columns. In canvas, frozen panes are trivial — they're just separate render passes with adjusted clip rects. Glide and RevGrid both implement frozen rows/columns this way.

**Buffer/overscan.** AG Grid defaults `rowBuffer = 10` (criticised as too high in #7358 for slow rows); a better policy is **velocity-aware overscan**: scale buffer size to scroll velocity (1× rows when slow, 5–10× when fast-flinging) so blank frames don't appear at high speed but memory stays low at rest. Glide does a variation of this.

**Scroll anchoring and restoration.** CSS `overflow-anchor: auto` (default) interacts poorly with virtualised content; you must either disable it (`overflow-anchor: none` on the scroll container) or implement your own anchor — pin to a row index and offset, not a pixel. TanStack Virtual exposes `initialOffset + initialMeasurementsCache` for restoration; the same approach works for canvas grids.

**Occlusion culling for tabular data.** Tabular data has trivial culling (rectangular AABB intersection with viewport), so research from 3D rendering doesn't transfer much. The relevant research is incremental rendering / dirty-rect tracking — Quadratic's approach (only redraw cell hashes that intersect dirty cells) is the right model and is also how CodeMirror 6 paints.

**GPU acceleration techniques relevant to grids.** (a) **MSDF/SDF font atlases** — Quadratic uses these to handle 1%–1000% zoom; (b) **instanced rectangles** for cell backgrounds and borders; (c) **compute shaders for sort/filter** on numeric columns only (string ops are still CPU-bound — there's no good GPU string algorithm); (d) **GPU radix sort** for numeric columns at 10M+ rows is genuinely faster than CPU but requires WebGPU.

### 2.3 Data structures & algorithms for tabular data

**For sorted/filtered/grouped views over mutable data.** The right structure is a **column-store with bitmap selection vectors** plus **persistent index structures for sort orders**:
- **Selection vectors** (Roaring bitmaps, JS implementations exist) make filter intersection O(n/word_size).
- **Sort orders as permutation arrays** (plus a generation counter for invalidation) avoid copying data.
- For mutable data with frequent inserts: **order-statistic trees** (size-augmented red-black) or **B-trees** allow O(log n) rank queries needed for "show me rank i in current sort order".
- For range aggregates (sum across a viewport): **Fenwick trees** over the sort permutation give O(log n) prefix sums. Already standard in spreadsheets and game-engine UI lists.
- **Skip lists** are simpler than B-trees and are what HyperFormula uses internally for dependency-graph adjacency.

**Incremental computation / differential dataflow.** Frank McSherry's CIDR 2013 *Differential Dataflow* and the follow-on Naiad (cacm.acm.org) define a partially-ordered set of differences: rather than store collections, store the deltas, and operators consume deltas to produce deltas. The 2022 *DBSP* paper (arXiv 2203.16684, VLDB 2023, extended in VLDB Journal 2025 — Budiu, McSherry, Ryzhyk, Zellweger; verified in Lean) generalises this to a 4-step recipe: (1) describe streams, (2) define IVM mathematically, (3) algorithm to incrementalise any DBSP program, (4) lower SQL/Datalog onto DBSP. Feldera is the production Rust implementation, MIT-licensed.

For oneGrid the practical takeaway: **don't recompute aggregates from scratch when a single row changes**. Maintain group aggregates as Z-sets and apply DBSP-style incremental update operators. This is how Linear's reactive UI stays sub-50ms on every change despite a graph-database-on-the-client model.

**Reactive/observable patterns for cell-level invalidation.** Solid.js's signals are the most refined instance of fine-grained reactivity (sitepoint, strapi, solidjs/solid-workgroup discussion #2): each signal has a getter and a setter, signals form an automatic dependency graph as effects/memos read them, and only effects whose dependencies actually changed re-run. Angular adopted signals; Preact has `@preact/signals`; the TC39 Signals proposal (2024) is in stage 1. For oneGrid, signals are the right substrate because **the same dependency-tracking machinery works for cell formulas, derived columns, group aggregates, and UI render hooks**. The Linear Sync Engine reverse-engineering (wzhudev/reverse-linear-sync-engine, endorsed by Linear's CTO) shows MobX achieving similar results in production at scale; signals are MobX with less ceremony.

**Tree representations for hierarchical/grouped data.** From the SQL hierarchy literature (Wikipedia *Nested set model*, Ackee blog, libtree docs):
- **Adjacency list** — O(1) parent lookup, recursive descendant queries; simplest; what AG Grid uses internally.
- **Materialised path** — O(log n) ancestor checks; cheap descendant queries (`LIKE 'path/%'`); awkward moves.
- **Nested set** — O(1) descendant range checks; brutal insertion costs (rebuild left/right indices).
- **Closure table** — explicit ancestor/descendant pairs; fast both ways; storage explodes (n² in worst case).

**Recommendation:** For grid grouping (where the user expands/collapses dynamically and we need both "is i a descendant of j?" and "iterate visible flat order"), use **adjacency list for the source-of-truth tree + a cached flattened-visible-rows array maintained incrementally**. Closure tables are overkill in-memory; nested sets penalise the common case of expanding a group. AG Grid's `RowNode` graph effectively does this.

**Range / interval trees for selections.** Cell range selection (especially Excel-like multi-rectangular selections with Ctrl+click) maps cleanly to interval trees on rows × interval trees on columns. For 10M rows, a sparse representation (set of {rowStart, rowEnd, colStart, colEnd} rectangles, merged on insert) is enough; the interval tree only matters if users select millions of disjoint rows.

### 2.4 Query and database optimisation patterns

**Column store vs row store.** DuckDB, ClickHouse, and Apache Arrow agree: columnar (SoA) layout wins for analytics because (a) it's cache-friendly when scanning a single column, (b) it compresses better (run-length, dictionary, bit-packing), (c) it enables SIMD/vectorised execution. Row-store (AoS) wins only for transactional point-lookups where you read all columns of one row, which is rare in grids. **For oneGrid: use columnar storage for the in-memory dataset, but expose row-shaped APIs for compatibility.**

**Predicate pushdown, late materialisation, vectorised execution.** The DuckDB-Wasm VLDB 2022 paper (vldb.org/pvldb/vol15/p3574-kohn.pdf) shows DuckDB-WASM beating Arquero/Lovefield by 10–100× on TPC-H scale-factor 0.5 in the browser, primarily because of vectorised execution (process 1024+ rows per loop iteration) and late materialisation (only materialise visible columns at the end of the pipeline). For oneGrid: when filters are applied, return selection bitmaps and only materialise the visible viewport rows × visible columns into the renderer — this is "late materialisation" applied to UI.

**Indexing strategies.** For interactive sort/filter on 10M rows in-memory:
- **Sort once per column**: cache sort-permutation arrays (Int32Array) keyed on column id + direction.
- **Filter as bitmap intersection** of per-column bitmap indices.
- **Build category indices lazily**: when a user filters a categorical column, build a value→bitmap dictionary once, reuse forever.
- For numeric range filters, a **sorted run-length-encoded index** is enough; full B-trees are overkill in-memory.

**DuckDB-WASM + Arrow JS in 2025–2026.** The state of the art has shifted dramatically. Practical numbers from MotherDuck and motifanalytics.medium.com posts: a 1.5 GB Parquet file aggregated in ~1.8 s in browser; a 5M×5M join in ~3.5 s; the WASM cap (4 GB per tab in Chrome) and single-threaded execution remain limits. **For oneGrid the implication is that we should not reinvent a query engine — we should support DuckDB-WASM natively as an optional engine for users who need SQL semantics, and otherwise use Arrow arrays as the canonical in-memory format.**

**SIMD in JavaScript/WASM.** WebAssembly SIMD (V8, Firefox, Safari ~2021–2022) gives 1.7–4.5× speedup on plain WASM for vector ops (TensorFlow.js blog). With multi-threading, another 1.8–2.9× (so ~6–13× over scalar JS). The SIMD value is concentrated in numeric column scans (sum, min/max, predicate count); strings benefit less. **Use SIMD for hot paths inside Rust/Zig WASM modules**, not for general-purpose JS code.

**Memory layout (AoS vs SoA).** Apache Arrow specifies 64-byte alignment with explicit padding precisely so SIMD loads are cache-aligned. For oneGrid: store every column as a typed-array-backed `ArrowVector` (Int32Array, Float64Array, Uint8Array bitmap for booleans/nulls, dictionary-encoded for low-cardinality strings). Avoid `Array<RowObject>` — that's 2–10× memory and GC-heavy.

### 2.5 Server-side row models and streaming

**Cursor vs offset pagination at scale.** Cursor (keyset) pagination is unambiguously better at deep offsets — empirical measurements (milanjovanovic.tech) show 17× speedup at 1M-row depth. Offset pagination uses `LIMIT N OFFSET M` which forces the DB to scan-and-discard M rows. Cursor pagination uses `WHERE (sort_col, id) > (last_sort_val, last_id)` which uses the index directly. **AG Grid's SSRM is offset-based, which is its biggest design flaw.** For volatile data (live sort changes, inserts), cursors are also more correct: the user sees a stable view as they scroll.

**For oneGrid, the SSRM contract should be:**
```
fetchBlock({
  cursor: {sortVals: [...], rowId: ...} | null,  // null = first block
  direction: 'after' | 'before',
  limit: number,
  filters: FilterModel,
  sort: SortModel,
  groupKeys: string[],     // for hierarchical drill-down
  pivotState: PivotModel,
}) => Promise<{
  rows: ArrowRecordBatch,    // not JSON
  nextCursor, prevCursor,
  totalRowCount?: number,    // optional, omit for ∞ scroll
}>
```

**Streaming data into grids.** Three transports, increasing in complexity:
1. **SSE (Server-Sent Events)** — best for one-way push. HTTP/2 multiplexing removes the connection-cap concern. Auto-reconnect built in. Use for live-update streams.
2. **WebSockets** — bidirectional, lowest latency. Use when the client also pushes (cell edits, range subscriptions).
3. **gRPC-Web / Arrow Flight** — best throughput. Arrow Flight is purpose-built for streaming Arrow record batches but has limited browser support; you typically tunnel Arrow IPC over a WebSocket (this is what Graphistry, Perspective, and Motif Analytics do — see HN discussion linked in their blogs).

**Caching strategies.** AG Grid uses a fixed-block LRU (`maxBlocksInCache`). A **sliding-window cache keyed on (sortKey, filterKey, cursor)** is better: when filter changes, invalidate filter-keyed entries but keep sort-keyed entries that share the new filter. **Prefetch** ±2 blocks around the viewport. **Bloom-filter-based negative cache** for "row-id-not-found" results helps with optimistic updates.

**Optimistic updates and conflict resolution.** Two production references stand out:
- **Linear Sync Engine** (Tuomas Artman talks; wzhudev reverse-engineering, endorsed by Linear's CTO): Object Pool of MobX-observable models, transaction queue, server broadcasts delta packets. Last-Write-Wins for most fields; CRDTs only for free-text descriptions. ~50ms full page loads.
- **Figma's multiplayer protocol** (madebyevan.com/figma): kiwi binary serialisation, custom CRDT-like operations on a tree of objects.

For oneGrid: use **server-authoritative LWW** by default; add CRDT support for cells flagged as "collaboratively editable text"; queue mutations locally and reconcile on reconnect.

### 2.6 Graph and dependency tracking

**Spreadsheet calculation engines, public knowledge.** The HyperFormula architecture documentation (hyperformula.handsontable.com/docs/guide/dependency-graph.html) is the most thorough public spec. The arXiv 2023 paper *Efficient and Compact Spreadsheet Formula Graphs* (arxiv.org/pdf/2302.05482) analyses real Enron + GitHub spreadsheet graphs and proposes compact representations.

**Topological sort strategies.**
- **Static topo sort + dirty propagation**: build the topo order once, mark dirty cells on edit, recompute in topo order skipping clean cells. This is what Excel and HyperFormula do.
- **Lazy / demand-driven (Adapton)**: only recompute when something reads the result. The PLDI 2014 *Adapton* paper (Hammer et al., dl.acm.org/doi/10.1145/2666356.2594324) introduces a Demanded Computation Graph (λᵢ𝒸𝒸ᵈᵈ) that achieves dramatic speedups versus eager incremental approaches when only a small fraction of outputs are observed. The miniAdapton paper (arxiv 1609.05337) gives a minimal Scheme implementation.
- **Differential dataflow / DBSP**: more general but heavier; use it for aggregations, not per-cell formulas.

**Recommendation for oneGrid formulas:** Adapton-style demand-driven recomputation by default (only recompute cells that are visible or feed visible cells), with eager mode as opt-in for batch jobs. This is a meaningful differentiator over HyperFormula which is eager.

**Representing cell dependencies at scale.**
- HyperFormula's key trick: **range nodes** in the dependency graph (not edges from every cell in a range to the formula). Plus **range decomposition**: `B5:D20` is composed from `B5:D19 + last-row` so overlapping aggregates share work. Without this, n cells each doing `SUM(A1:A_i)` makes ~n²/2 edges; with it, ~n.
- **Sparse columnar dependencies**: store dependencies as `Map<columnId, RoaringBitmap<rowId>>` for cells, plus a small set of range nodes.
- For 10M cells with sparse formulas (typical: <5% of cells contain formulas), this fits comfortably in memory.

**Cycle detection.** Tarjan's SCC algorithm on the dependency graph at edit-time, scoped to the affected sub-graph (the new edge and its transitive predecessors).

**How Causal/Equals/Rows.com/Quadratic handle large graphs.** Public info is thin. Quadratic (quadratichq/quadratic, blog "Building a High-Performance Spreadsheet Renderer") moves the entire grid state into a Rust core in WASM, separates Core/Render workers, and uses SharedArrayBuffer for viewport coordination — the dependency graph runs server-side-equivalently in the WASM core, off the main thread. Causal and Rows.com don't publish architecture details; reverse-engineering suggests both use server-side recompute (REST round-trips per change), which is why their UX feels less snappy than Quadratic.

**Recent reactive-frameworks research applicable here.** Adapton (PLDI 2014, miniAdapton arxiv 1609.05337); Self-Adjusting Computation (Acar et al.); Incremental λ-calculus (Cai, Giarrusso, Rendel, Ostermann, ICFP 2014); DBSP (VLDB 2023). The signals/Solid.js literature is the practical web instantiation of the Adapton ideas.

### 2.7 Framework-agnostic design

**Patterns that work in 2025–2026.**
- **Vanilla TS core + thin adapters.** TanStack Table's approach. Costs ~5–15 kB per adapter. Works because the core never touches DOM.
- **Web Components.** Lit-based or Stencil-based (RevoGrid). Standards-based but: (a) React 18 still has gotchas with custom event passthrough, fixed in React 19 but ecosystem hasn't caught up; (b) SSR is awkward; (c) Smashing Magazine 2025 review notes that "framework-agnostic" is more aspiration than reality once you need styles, theming, and event semantics; (d) DEV "Components are Pure Overhead" benchmarks show Lit and Svelte degrade as component count grows, comparable to React.
- **Compiled multi-target** (Stencil, Mitosis): code once, compile to React/Vue/Angular wrappers. Stencil is what RevoGrid uses; works but constrains the authoring experience.

**Recommendation for oneGrid:** vanilla TS core with framework adapters. **Do not** make the public API a Custom Element. Provide an *optional* `@onegrid/wc` that wraps the core in a Custom Element for users who want it (shipping CE = framework-coupled feel for non-CE users is bad).

**Lessons from TanStack, Lit, Floating UI, Radix UI primitives.**
- **TanStack**: separate state machine from rendering; let consumers own JSX. Worked, but pushes virtualization concerns onto users.
- **Floating UI**: tiny core (3 kB) + framework adapters with idiomatic ergonomics (`useFloating` for React, `createFloating` for Solid). Excellent model for oneGrid.
- **Radix UI**: primitives that compose; accessibility built in. Same model.
- **Lit**: best when target is a true component (button, card); poor fit for stateful, performance-critical engines.

**Performance overhead of adapters.** Floating UI's React adapter adds <1 kB and a few hooks. Web Components add the Shadow DOM / slot overhead (~10–20% in micro-benchmarks per vogloblinsky/web-components-benchmark). React-as-host-of-Web-Component is the worst combo in our benchmarks; React-with-thin-adapter is the best. Stick with adapters.

### 2.8 Accessibility and UX

**WAI-ARIA grid pattern (W3C APG).** The current spec (w3.org/WAI/ARIA/apg/patterns/grid/) requires every cell either to be focusable or to contain a single focusable widget. Screen readers in application mode skip non-focusable content. Use `aria-rowindex`, `aria-colindex`, `aria-rowcount`, `aria-colcount` on the grid; one cell at `tabindex="0"`, others `tabindex="-1"`; arrow-key navigation moves focus.

**Common implementation pitfalls (accesify.io, smashingmagazine, glide ITNEXT).**
- Virtualised cells lack ARIA indexing because they're not in the DOM.
- Edit modes don't announce themselves.
- All-cells-tabbable creates navigation overload.
- Canvas grids drop the entire accessibility tree; MDN explicitly warns against canvas for accessible apps. Mitigation is a parallel "accessibility shadow DOM" — a hidden, properly-labelled DOM tree that mirrors the visible canvas viewport.

**Screen reader behaviour with virtualised grids.** NVDA, JAWS, and VoiceOver all read only what's in the DOM. The accessibility shadow approach (canvalun's medium post on canvas accessibility, Glide's actual implementation) is: for the visible viewport ± buffer, render a hidden `<table>` with `aria-rowindex`/`aria-colindex` reflecting the *true* row index in the virtual list, not the DOM position. Update on scroll (debounced ~50ms).

**Touch and mobile gestures.** Glide Data Grid release notes mention iOS 60 FPS kinetic-scroll work being non-trivial on canvas; their solution is to "artificially boost" framerate during inertia. For oneGrid, treat mobile as a first-class target: pinch-to-zoom (delegate to native scroll where possible), long-press for context menu, swipe row to reveal actions. Variable cell heights interact badly with sticky headers on iOS Safari — test extensively.

**Internationalisation.**
- **RTL**: requires column-order reversal (right-to-left visual order with logical model unchanged). RevoGrid v4.11+ added RTL support; AG Grid has it. In canvas, this is a transformation-matrix flip.
- **Complex scripts** (Arabic shaping, Indic conjuncts): use the platform `CanvasRenderingContext2D.fillText` (not your own glyph atlas) so OS shaping engines work; Glide's ~50% CPU in `fillText` is the cost of correctness.
- **Locale-aware sorting**: use `Intl.Collator` (with `{numeric: true}` for natural sort). For 10M rows, cache the collator instance and possibly precompute `toSortKey` strings.

### 2.9 Benchmarks and performance

**Existing public benchmarks.**
- **js-framework-benchmark (krausest)** — krausest.github.io/js-framework-benchmark — measures create/update/swap/select on a 10k-row table. Useful for the core reconciliation cost, not for grid-specific features. Latest (2025–2026 Chrome 140–144) shows Solid, vanilla, and signal-based frameworks ~2× faster than React on these tasks.
- **Webix's own benchmarks** (webix-ui medium 2025) — Webix 17 ms init for 100k rows; AG Grid degrades >100k.
- **Syncfusion's published benchmarks** — 100k×12 with sort/filter/group active.
- **DZone (Dave Greene, 2020)** — server-side scrolling small/medium/large datasets across vendors. Methodology was solid; results dated.

**Methodology issues to avoid.** Don't measure first-paint with empty data. Measure: (a) cold start with N=100k/1M/10M, (b) sort by column with N rows, (c) filter chain on 3 columns, (d) group by 2 cols + aggregate, (e) scroll FPS at high velocity, (f) memory at rest, (g) single-cell update latency. Always include a control with no library.

**Real-world numbers to target (2026).** Synthesising Glide, Quadratic, DuckDB-WASM, Webix:
- 1M rows × 100 cols, client-side, sort: **<300 ms** (state of the art ~150 ms with DuckDB-WASM)
- 10M rows, SSRM block fetch: **<200 ms** server-side (network-bound; don't include in client metric)
- Scroll FPS during fast-fling 1M rows: **60 FPS** (Glide achieves this; AG Grid does not >100k)
- First contentful paint with grid + 10k rows: **<400 ms** on M1 / mid-range Android
- Memory at rest, 1M rows × 50 cols numeric: **~400 MB** with object-rows; **~80 MB** with Arrow columns

**Designing oneGrid's benchmark suite.** Six suites:
1. Cold-start: 100k, 1M, 10M (SSRM).
2. Interaction: sort, filter, group, pivot (each as separate runs, with timing percentiles).
3. Scroll: average + p99 frame time at 1× and 5× scroll velocity.
4. Memory: bytes per row at rest, GC pause durations.
5. Live update: 100, 1k, 10k cell updates/sec (mimic financial data streaming).
6. Formula recalc: dependency graph with 100k cells, 5–50 deps each, single-cell edit propagation time.

Run on real hardware (M1 + mid-range Android Pixel 6a + a low-end laptop). Use Chrome's Performance API + Lighthouse + a custom FPS instrument. Publish raw traces.

---

## 3. Competitive Landscape Table

| Library | Rendering | Virtualisation | Framework support | Bundle (gzipped) | License | Strengths | Weaknesses |
|---|---|---|---|---|---|---|---|
| **AG Grid Community** | DOM | Row + column | React, Angular, Vue, JS | ~140 kB | MIT | Most features in OSS; mature | DOM wall ~100k rows; no SSRM |
| **AG Grid Enterprise** | DOM | Row + column | Same | ~200+ kB | Commercial (~$995–$1,995/dev/yr, subscription only) | SSRM, pivot, master/detail, charts | Expensive; offset-based SSRM; React UI perf regression issues |
| **TanStack Table v8** | None (headless) | None (pair w/ TanStack Virtual) | React, Vue, Solid, Svelte, Qwik, JS | ~10–15 kB | MIT | Tiny, type-safe, framework-agnostic core | No rendering, no SSRM, no formulas; consumers misuse it |
| **Glide Data Grid** | Canvas 2D | Cell-level | React only | ~140 kB | MIT | 60 FPS at millions of rows | React-only; weak a11y; no SSRM/formulas |
| **Handsontable + HyperFormula** | DOM (HOT) + headless engine (HF) | Row + column | React, Angular, Vue | HOT ~250 kB + HF ~200 kB | HOT commercial; HF GPLv3/commercial | Best-in-class formulas, Excel-like UX | Expensive; DOM perf wall; older codebase |
| **RevoGrid** | DOM (Stencil WC) | Row + column | All major (WC + wrappers) | ~150 kB | MIT | Web Component, RTL, copy-paste | Smaller community; perf below Glide above 100k |
| **MUI X DataGrid Pro/Premium** | DOM | Row + column | React | Large w/ MUI | Pro/Premium commercial; Community MIT | Polish, tight Material integration | React-only; locked to MUI; ecosystem cost |
| **Tabulator** | Virtual DOM | Row + column | All (vanilla + wrappers) | ~110 kB | MIT | Mature, MIT, framework-agnostic | jQuery-era patterns; perf below 100k |
| **Perspective (FINOS)** | Canvas (WC) + WASM engine | Row + column | Custom Element | ~1 MB+ (incl. WASM) | Apache 2.0 | Streaming, Arrow-native, real engine | UI dated; CE ergonomics |
| **Quadratic** | WebGL (PixiJS) | Cell-level | Standalone product (not a library) | n/a | AGPL/commercial | 60 FPS infinite-canvas, Rust core | Not a library; spreadsheet-only |
| **Webix Grid** | DOM | Row + column | Vanilla, wrappers | ~200 kB+ | Commercial | Best DOM init time (~17 ms / 100k) | Paid; older API |
| **Syncfusion / Bryntum / Kendo / jqxGrid** | DOM | Row + column | All major | varies | Commercial | Polished, supported | Closed source; cost |

**oneGrid's intended position:** Glide-class rendering performance + AG Grid Enterprise feature set + TanStack-class framework-agnosticism + DuckDB-class data engine + HyperFormula-class formulas + Adapton-style demand-driven recompute, all under one MIT license.

---

## 4. Differentiation Opportunities

Where every existing grid underperforms, and what oneGrid can uniquely deliver:

1. **True 10M-row client-side feel with SSRM hidden behind it.** No grid today combines a canvas-class scroll experience with a transparent SSRM that pre-fetches Arrow batches. AG Grid has SSRM but DOM-bound rendering; Glide has rendering but no SSRM. The combination is the moat.

2. **Columnar memory by default, row-shaped API on top.** Every existing grid stores `Array<Object>`. Switching to Arrow-compatible SoA gives a 4–8× memory win at no API cost (row accessors return synthetic row objects on demand).

3. **DuckDB-WASM as a first-class optional engine.** Let users say "give me the rows where `revenue > 100k AND region = 'EMEA' GROUP BY product`" in SQL and have it run in-process. No grid does this; only Perspective gets close.

4. **Adapton-style demand-driven formulas.** HyperFormula recomputes everything on edit; Adapton recomputes only what's observed. For sheets with millions of formula cells but only thousands visible, this is a 100×+ win. No public grid offers this.

5. **Differential aggregation for grouping/pivoting.** When one row of 10M changes, recompute only the affected group aggregate, not the whole pivot. DBSP-style IVM for the pivot path.

6. **Best-in-class accessibility for canvas grids.** A formal accessibility-shadow-DOM contract documented and tested with NVDA/JAWS/VoiceOver. None of the canvas grids ship this; it's a clear, ethical, marketable differentiator.

7. **WebGPU compute path for filter/sort on numeric columns.** Behind a feature flag (because of browser support), but a 10–100× win on numeric workloads when available.

8. **Single core, all frameworks, real performance parity.** TanStack achieves the API but pushes perf onto users; oneGrid should ship a renderer per framework that's already optimal — consumers shouldn't need to know what `useMemo` is.

9. **Stream-first server contract.** Cursor pagination + Arrow IPC over WebSocket/SSE, with an opinionated TypeScript schema published as `@onegrid/protocol`. AG Grid SSRM is JSON-only and offset-based.

10. **Open-source Enterprise feature parity.** Pivoting, master-detail, integrated charts, range selections, Excel export — all MIT. Funded by support contracts / commercial cloud sync, not by paywalled features. This is the same play TanStack and Apache Arrow run successfully.

---

## 5. Annotated Reading List (~20 most important sources)

1. **Glide Data Grid source + ITNEXT post by Jason Smith** — github.com/glideapps/glide-data-grid; itnext.io/i-wrote-an-html-canvas-data-grid-so-you-dont-have-to-d945aa4780b4. The canonical canvas-grid retrospective.
2. **AG Grid SSRM docs** — ag-grid.com/javascript-data-grid/server-side-model/. Reference protocol; study its limits.
3. **HyperFormula docs (key concepts + dependency graph)** — hyperformula.handsontable.com/guide/key-concepts.html; .../docs/guide/dependency-graph.html. Best public formula-engine architecture document.
4. **Quadratic engineering blog "Building a High-Performance Spreadsheet Renderer"** — quadratichq.com/blog/building-a-high-performance-spreadsheet-renderer-why-we-chose-webgl-over-html. WebGL+Rust+WASM at 60 FPS.
5. **Quadratic's `how_quadratic_works.md`** — github.com/quadratichq/quadratic/blob/main/docs/how_quadratic_works.md. Multi-worker architecture sketch.
6. **DuckDB-WASM (VLDB 2022)** — vldb.org/pvldb/vol15/p3574-kohn.pdf. The browser-OLAP benchmark + architecture.
7. **Apache Arrow Columnar Format spec** — arrow.apache.org/docs/format/Columnar.html. Memory-layout bible.
8. **Differential Dataflow (CIDR 2013, McSherry et al.)** — cidrdb.org/cidr2013/Papers/CIDR13_Paper111.pdf.
9. **DBSP: Automatic IVM for Rich Query Languages (VLDB 2023, extended VLDB Journal 2025)** — arxiv.org/abs/2203.16684; link.springer.com/article/10.1007/s00778-025-00922-y. The successor to Differential Dataflow; Lean-verified.
10. **Adapton: Composable, Demand-Driven Incremental Computation (PLDI 2014)** — dl.acm.org/doi/10.1145/2666356.2594324; miniAdapton (arxiv 1609.05337). The lazy-recompute model.
11. **Efficient and Compact Spreadsheet Formula Graphs (arxiv 2302.05482)** — empirical study of real spreadsheet dependency graphs.
12. **Solid.js fine-grained reactivity docs + workgroup discussion #2** — docs.solidjs.com/advanced-concepts/fine-grained-reactivity; github.com/solidjs/solid-workgroup/discussions/2. Signals primer.
13. **Linear Sync Engine reverse-engineering (wzhudev, endorsed by Linear's CTO)** — github.com/wzhudev/reverse-linear-sync-engine; linear.app/now/scaling-the-linear-sync-engine. Production sync engine.
14. **Figma WebGPU rendering blog (2024)** — figma.com/blog/figma-rendering-powered-by-webgpu. WebGL→WebGPU migration.
15. **Figma WebAssembly blog + Evan Wallace's "Figma" madebyevan.com page** — figma.com/blog/webassembly-cut-figmas-load-time-by-3x; madebyevan.com/figma. The original web-rendering-engine architecture post.
16. **WAI-ARIA Grid pattern (W3C APG)** — w3.org/WAI/ARIA/apg/patterns/grid/. The accessibility spec.
17. **TanStack Table introduction + overview** — tanstack.com/table/v8/docs/introduction. The headless reference.
18. **AG Grid bundle size blog + GitHub bundle-size repo (Stephen Cooper)** — blog.ag-grid.com/minimising-bundle-size/; github.com/StephenCooper/ag-grid-bundle-size.
19. **js-framework-benchmark methodology** — github.com/krausest/js-framework-benchmark. Benchmark fairness.
20. **Notion's data model blog** — notion.com/blog/data-model-behind-notion. Block-graph thinking applicable to row-as-record models.

Bonus: Perspective (finos/perspective) source code; CodeMirror 6's height-map (codemirror.net) for variable-height virtualisation; libtree closure-table docs for tree storage.

---

## 6. Open Questions Where Prototyping Is Required

1. **Canvas vs WebGPU baseline at v1.** WebGPU is right *eventually* but Firefox stable still gates it as of mid-2025–2026. Prototype both paths and measure the WebGPU/Canvas crossover point on real hardware. The decision to ship WebGPU as default vs. fallback should be data-driven.

2. **Signals library: build-our-own vs. adopt.** Solid's `solid-js/store` standalone, `@preact/signals-core`, or hand-rolled? A grid pushes signals harder than UIs (millions of fine-grained subs). Run a stress test before committing.

3. **DuckDB-WASM as a hard dependency vs optional.** DuckDB-WASM is ~6 MB; that's a deal-breaker for many. Two-tier strategy: a built-in lightweight columnar engine (~50 kB) handles 90% of cases, DuckDB-WASM is opt-in for SQL semantics or >5M rows in-browser. Prototype the lightweight engine and measure.

4. **Formula engine: Embed HyperFormula vs build native.** HyperFormula is GPLv3 + commercial — copyleft is incompatible with MIT distribution. Either (a) write a fresh formula engine (large effort but clean license), (b) negotiate a license, or (c) make it pluggable (consumer brings their own). Prototype option (a) with Adapton semantics — that's a differentiator anyway.

5. **Multi-threading model.** SharedArrayBuffer requires COOP/COEP headers; some hosts don't allow them. How much do we lose without SAB? Prototype a non-SAB fallback with `postMessage` Transferable typed arrays.

6. **Accessibility mirror DOM cost.** What's the actual perf impact of maintaining a hidden DOM mirror of the canvas viewport at 60 FPS scroll? Likely fine, but measure on slow devices.

7. **Server protocol: pure cursors vs hybrid.** Cursor pagination is correct but breaks "jump to row 5,000,000" UI. Prototype a hybrid where cursors are primary but the server can answer rank-queries on demand.

8. **WebGL/WebGPU text rendering quality at low DPI.** SDF/MSDF fonts are great at extremes; canvas `fillText` is great at 100%. The crossover is non-obvious; measure.

---

## 7. Recommended v1 Architecture

**Layered architecture, top-to-bottom:**

```
┌────────────────────────────────────────────────────┐
│  Framework adapters (~5–10 kB each)                │
│  @onegrid/react, /vue, /svelte, /solid, /angular   │
│  /lit, /vanilla. Idiomatic hooks/composables.      │
├────────────────────────────────────────────────────┤
│  @onegrid/core (vanilla TS, ~80–120 kB gzipped)    │
│  • Renderer: Canvas2D primary; WebGPU plugin       │
│  • Accessibility shadow DOM                        │
│  • Editor/menu/popover overlay layer (DOM)         │
│  • Signals reactive substrate                      │
│  • Selection model (range tree on rows × cols)     │
│  • Layout engine (Fenwick tree row heights)        │
├────────────────────────────────────────────────────┤
│  @onegrid/data (~30 kB)                            │
│  • Arrow-compatible columnar tables (SoA)          │
│  • Lightweight built-in query engine               │
│  • Bitmap selection vectors (Roaring)              │
│  • Sort-permutation cache                          │
│  • Group tree (adjacency list + flat-vis cache)    │
│  • IVM hooks for incremental aggregates            │
├────────────────────────────────────────────────────┤
│  @onegrid/formula (~40 kB) — optional              │
│  • Excel-compatible parser (Chevrotain or hand)    │
│  • Adapton-style demand-driven recompute           │
│  • Range-node dependency graph w/ HF-style decomp  │
│  • Signals integration                             │
├────────────────────────────────────────────────────┤
│  @onegrid/ssrm (~15 kB)                            │
│  • Cursor-based block fetcher                      │
│  • Sliding-window LRU cache                        │
│  • Optimistic update queue                         │
│  • Arrow IPC over WebSocket/SSE adapter            │
├────────────────────────────────────────────────────┤
│  @onegrid/duckdb (~6 MB lazy) — optional plugin    │
│  • Wraps DuckDB-WASM as engine                     │
│  • SQL queries → cursor-paged results              │
└────────────────────────────────────────────────────┘
```

**Concrete decisions:**

- **Rendering:** Canvas 2D as default. WebGPU plugin for numeric column compute (sort, filter on Float/Int columns) when `navigator.gpu` is available. DOM overlays for cell editors, context menus, tooltips, popovers, and the **accessibility shadow** (off-screen but in DOM). One render thread on the main thread; data work on a Web Worker; optional Render Worker if SAB available (Quadratic-style).
- **Data structures:** Arrow `Table` of typed-array columns. Selection bitmaps via `roaring-wasm`. Sort permutations as `Int32Array` cached per `(column, direction)`. Group hierarchy as adjacency list + a `flatVisibleRows: Int32Array` rebuilt incrementally. Row heights stored in a Fenwick tree of `Float32Array` for O(log n) `offsetForRow`/`rowAtOffset`. Cell selections as a small union of rectangles, merged on insert.
- **Reactivity:** Hand-rolled signals modeled on Solid's primitives; alternately `alien-signals` (a small standalone signals library). Read tracking through `peek()`/`get()`. Effects scheduled to microtask, rendered on `requestAnimationFrame`. Cell-level subscriptions: each visible cell binds to a memo over `(rowId, columnId, sortVersion, filterVersion)`.
- **Dependency tracking (formulas):** Adapton-inspired: a cell's value is an `athunk`; reading it during render registers a demand edge; edits dirty the relevant nodes; the next render forces only what's observed, in topological order. Range nodes + decomposition borrowed from HyperFormula.
- **Framework adapters:** vanilla TS classes wrap the core; React adapter is `useOneGrid({columns, data, …}) -> {gridProps, refs}` returning a `<canvas>` + overlay DIVs you compose in JSX. Vue/Svelte/Solid analogues. No Web Component in the public API.
- **SSRM:** the protocol described in §2.5. Default transport WebSocket; SSE supported. JSON or Arrow IPC negotiated at handshake. Cursors are opaque, server-defined strings; client treats them as bytes.
- **Accessibility:** parallel hidden `<table>` reflecting current viewport, with `aria-rowindex`/`aria-colindex` carrying the *true* logical indices, `tabindex="-1"` on all cells except the active one, full ARIA grid pattern. Keyboard nav driven entirely from the accessibility shadow.

**Bundle target for the smallest useful v1:** ~120–150 kB gzipped including core + react adapter + Arrow runtime (slim) + roaring. Below MUI X Pro, comparable to AG Grid Community modules-only. With formulas: +40 kB. With DuckDB: lazy-loaded.

**License:** MIT for everything. Sustainability via paid hosted sync engine + paid support, not via paywalled features.

---

## 8. Phased Build Plan (Validate Riskiest Assumptions First)

The riskiest assumptions, ranked: (1) canvas rendering can match Glide while supporting accessibility cleanly, (2) Arrow-columnar data layer with signals stays under 100 kB and outperforms object-rows, (3) the SSRM cursor protocol works for sort/filter/group changes without round-trip storms, (4) Adapton-style formula recompute is implementable in JS at scale, (5) framework adapters add no perf regressions.

**Phase 0 — Spike & Bench (2–4 weeks).** Build three throwaway prototypes:
- **A:** Canvas 2D renderer + Fenwick-tree heights + accessibility-shadow `<table>`, hard-coded 1M Arrow-column rows. Measure FPS at 1×/5× scroll velocity; verify NVDA/VoiceOver/JAWS work.
- **B:** Arrow column store with bitmap-filter + sort-permutation cache. Bench against TanStack Table on 1M rows: filter chain, sort, group aggregate. Target: 5–10× faster, ≥4× less memory.
- **C:** SSRM mock with WebSocket + cursor pagination + Arrow IPC. Simulate a volatile 10M-row backend (random insertions). Verify viewport stability across sort changes and partial cache invalidation.

**Decision gate after Phase 0**: if any of A/B/C don't land within target, revisit the architecture (e.g., consider WebGPU primary, or DuckDB-WASM as the only engine).

**Phase 1 — Core MVP (8–12 weeks).** Production-ready core + React adapter:
- Renderer (canvas + a11y shadow + editor overlays).
- Data layer (Arrow columns, bitmap filters, sort cache, simple grouping).
- Selection, copy/paste from clipboard (TSV/CSV), keyboard nav per ARIA Grid spec.
- Variable row heights, frozen rows/columns, basic theming.
- One framework adapter (React) + one rich example.
- Benchmark suite (the six suites in §2.9), public results page.

**Phase 2 — SSRM and streaming (6–8 weeks).** Cursor-paged SSRM, sliding-window cache, Arrow IPC, optimistic updates, conflict reconciliation. Reference Node.js + DuckDB server. Live-update streams.

**Phase 3 — Hierarchical grouping & pivoting (6–8 weeks).** Adjacency-list grouping with lazy expansion, server-side group lazy-load, IVM for group aggregates (DBSP-style). Pivot mode (rows × cols × measures, with Arrow as the wire format).

**Phase 4 — Formulas (10–12 weeks).** Excel-compatible parser, dependency graph with range nodes + HF-style decomposition, Adapton-style demand-driven recompute, ~150 most-used Excel functions to start, integration with cell value-resolution path.

**Phase 5 — Adapter expansion (4–6 weeks).** Vue, Svelte, Solid, Angular, vanilla, optional Web Component. Adapter test matrix.

**Phase 6 — WebGPU turbo path (6–8 weeks).** Compute-shader filter/sort for numeric columns; SDF font atlas for crisp pan/zoom; feature-flagged.

**Phase 7 — DuckDB-WASM plugin & polish (4–6 weeks).** Lazy-loaded `@onegrid/duckdb`. SQL editor. Excel export. RTL polish. Touch/mobile gesture audit.

Each phase ends with a public benchmark run and a release. Total to a credible v1.0 with feature parity to AG Grid Enterprise: **~12–14 months of focused work for a small team (3–5 engineers)**, less if you defer formulas/WebGPU to v1.1.

---

## Final Note on Source Quality and Conflicts

Where sources conflicted, I sided with: (a) primary documentation and source code over secondary explainers; (b) academic papers from VLDB/SIGMOD/PLDI/CIDR over Medium posts when claims overlap; (c) maintainer post-mortems (Glide ITNEXT, Quadratic blog, Linear Artman talks) over benchmark-marketing posts (jqWidgets/Webix self-comparisons treated cautiously). Grid-vendor benchmark posts uniformly favour the publishing vendor; treat them as floors, not ceilings. Pricing for AG Grid Enterprise (~$995–$1,995/dev/yr, subscription-only) is corroborated across Vendr, AG Grid's own ecommerce page, and third-party 2026 reviews; older posts mentioning perpetual licenses reflect the pre-v33 model, which is now legacy. For WebGPU adoption percentages I quoted SitePoint's mid-2025 estimate of 65–70% Chromium desktop coverage, which excludes Firefox stable and many enterprise-locked browsers — the practical "ubiquitous" date for WebGPU is likely 2027.

oneGrid's strongest moat is the *combination*: there is no library today that has even three of {canvas/WebGPU rendering at 10M rows, Arrow columnar storage, cursor-streaming SSRM, Adapton-style formulas, true framework-agnosticism, MIT license}. Each individual piece has prior art. The integration is the product.