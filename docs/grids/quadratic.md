# Quadratic

**Source**: https://quadratichq.com/ + https://docs.quadratichq.com/
**Repo**: https://github.com/quadratichq/quadratic
**License**: **Source-Available** ("Quadratic Source Available License" — not OSI-approved). Self-host repo `quadratichq/quadratic-selfhost` separate. Distinct from MIT/Apache; restricts running it as a competing hosted service.
**Pricing**: SaaS subscription starting at **$18 / user / month** (2026).
**Latest version**: 0.23.4 (per GitHub releases search; engineering moves fast).
**Stars**: ~3.6k
**Maintenance**: Active, VC-backed startup with full-time engineering. Multi-contributor.

> **Important**: Quadratic is a **product**, not a library. It's an end-user spreadsheet application. We're documenting it here because its **architecture is the closest existing reference for oneGrid's planned engine + WebGL render layer**, and several engineering blog posts publicly describe choices oneGrid will face.

## Architecture

The architecturally interesting parts, summarized from Quadratic's engineering blog and the founder/CEO interviews:

### Layered model
```
                    ┌──────────────────────────────┐
                    │  Main thread (UI, React/TSX) │
                    └──────────────┬───────────────┘
                                   │ MessageChannel + Transferable ArrayBuffers
                    ┌──────────────┴───────────────┐
                    │   Render Worker (PixiJS)     │  WebGL via offscreen-canvas-style coordination
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────┴───────────────┐
                    │   Core Worker (Rust+WASM)    │  spreadsheet engine, dependency graph
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────┴───────────────┐
                    │  Python (CPython→WASM) /     │  per-cell language runtimes
                    │  JS / SQL clients (workers)  │
                    └──────────────────────────────┘
```

### Rust core in WASM
The core spreadsheet engine — data model, formula evaluation, dependency graph, undo/redo, file format — is **a single Rust crate that compiles two ways**:
1. To **WebAssembly** for in-browser execution
2. To **native Rust** for the server (Axum + Tokio)

Quoting the Rust interview: "We have this core spreadsheet library that runs in the browser and on our servers. It's the same exact code." This is the most important architectural decision in the system. It means formula correctness, conflict resolution, and persistence have one implementation, not two.

### Multi-worker browser execution
Quadratic's engineering blog ("Building a High-Performance Spreadsheet Renderer") describes three threads:

1. **Main thread**: GPU rendering bound (issues WebGL draw calls), event handling, React UI.
2. **Render Worker**: PixiJS scene-graph layout, geometry buffer construction.
3. **Core Worker**: Rust+WASM engine — data model, formula evaluation, dependency graph.

Plus per-language workers for cell code (Python via CPython-compiled-to-WASM, JS, SQL).

Inter-thread communication uses **`Transferable` ArrayBuffers for zero-copy** transfer of vertex data and cell payloads. SharedArrayBuffer is referenced in the broader Rust+WASM context for direct shared-memory access where COOP/COEP headers are configured (cross-origin isolation enabled).

### PixiJS over WebGL — why
The "Why we chose WebGL over HTML" blog argues HTML DOM is structurally wrong for an infinite-canvas spreadsheet:
- One DOM node per cell explodes at thousands of visible cells.
- Panning forces full layout recalc across all elements.
- Styled elements generate separate draw calls; no batching.
- Pipeline order is opaque; no way to optimize draw order.

WebGL via PixiJS gives:
- GPU-batched draws (10–50 draw calls per frame regardless of cell count).
- Full control over rendering pipeline.
- 60fps panning/zooming across millions of cells.

### MSDF font rendering
**Multi-channel Signed Distance Field** glyph atlases — the same technique games use. Stores font glyphs as distance-field textures so the same atlas renders crisply at zoom levels from 0.01x to 10x with automatic anti-aliasing. Single texture for all zoom levels, with Unicode fallback paths.

### Spatial-hash / "tile-map" layout
This is the architectural piece most directly applicable to oneGrid's "vector tile" plan:

> "Cells organize into rectangular hash regions (15 columns × 30 rows), each maintaining independent vertex buffers."

Editing a cell rebuilds geometry only for **its hash region** — a 100x+ improvement over rebuilding the whole sheet. Hashes also enable:
- **Viewport culling** — only hashes intersecting the visible rect get drawn.
- **Progressive loading** — hashes can be loaded on demand as you pan.
- **LRU memory management** — when total geometry exceeds ~500 MB, oldest hashes get unloaded.

This is exactly the "vector tile" model — fixed-size tiles of the spreadsheet, each a self-contained drawable, paged in and out like map tiles in Google Maps. Quadratic explicitly draws the parallel: "drawn like a tile map, similar to Google Maps."

### Performance characteristics
- 60fps panning/zooming across **millions of cells**.
- 10–50 WebGL draw calls per frame regardless of visible cell count.
- Multi-threaded architecture eliminates main-thread blocking on data ops.
- Zero-copy data transfer via `Transferable` ArrayBuffers between threads.
- Memory ceiling ~500 MB before LRU unload kicks in.

### Dependency graph for cell formulas
The Rust core maintains a **directed dependency graph** between cells. When a cell value changes, the graph determines downstream recomputation order — same model as HyperFormula and Excel, but Rust-implemented and shared between client and server. Public docs are thin on the exact graph data structure (incremental topological sort, etc.); the existence of the graph and its central role are confirmed but not the implementation details.

### Multi-language cell runtimes
Each cell can be a Formula cell, a Python cell, a JavaScript cell, or a SQL cell. Python runs **CPython compiled to WebAssembly** entirely in the browser — no server round-trip — which keeps Python computation aligned with the rest of the in-browser engine. Cross-language data flow: a Python cell can reference a formula cell's output and vice versa, with the dependency graph spanning all cell types.

### Infinite canvas + collaborative editing
- **Infinite canvas** UX (like Figma): pinch/zoom, pan freely; cells aren't trapped in viewport-fixed columns.
- Real-time multiplayer collaboration; CRDT-flavored conflict resolution (Quadratic doesn't publicly specify the algorithm in detail).

### Backend
- Rust services (Axum + Tokio).
- File storage, multiplayer presence, AI-assist endpoints.
- Same Rust core crate as the client — no model drift.

## Framework support

N/A — Quadratic is a product, not a library you embed. The render layer (PixiJS + custom shaders + MSDF + Rust core) is not packaged as a reusable component.

## Features (be EXHAUSTIVE — note: these are *product* features, listed for completeness)

### Sorting / Filtering / Grouping / Pivoting / Aggregations
Spreadsheet-style: any cell can be a Python/SQL/Formula cell that does sort/filter/pivot/aggregate over a range. No declarative grid-feature surface — it's a programmable spreadsheet.

### Editing
Full cell editing with code-cell support (Python/JS/SQL/Formula), Monaco-based editor (the same editor VS Code uses), AI-assisted formula generation.

### Selection
Cell, range, multi-range; infinite-canvas marquee selection.

### Clipboard / copy-paste
Excel-compatible.

### Virtualization
Effectively yes — via the spatial-hash tile system. Only visible hashes are drawn.

### Accessibility
Limited; the WebGL canvas approach makes a11y harder than DOM-based grids. Quadratic provides keyboard navigation but does not currently expose AT-friendly DOM mirrors.

### Server-side / lazy loading
Files load progressively; per-tile geometry generated on demand. Server-side run mode also available via the shared Rust core.

### Streaming / live updates
Real-time multiplayer; updates flow through the dependency graph and trigger only affected hash regeneration.

### Formulas / computed cells
Yes — first-class. Built-in formula language plus Python/SQL/JS code cells with cross-language references.

### Theming / custom cell renderers
Limited theming (light/dark). Cells render as rasterized text via MSDF; custom rendering is constrained.

### Export
CSV, Excel.

### Master / detail / tree data / charts
Charts: yes, Plotly-based plus native chart cells. Master/detail and tree data: not part of the spreadsheet model.

### i18n / RTL / Mobile
Desktop-first; mobile experience secondary.

### Other notable features
- **AI-native** — every cell can be AI-generated/edited; built-in AI Formula Generator.
- **Connections** — to Postgres, MySQL, BigQuery, Snowflake, etc.
- **Self-host repo**: `quadratichq/quadratic-selfhost`.

## API style

Not applicable — it's a product. The Rust core's public surface is *not* a library API.

## Bundle size

Not applicable as a consumable library. The shipped app loads the Rust+WASM core (multi-MB), CPython+WASM, PixiJS, Monaco, and React shell. A typical first paint is several MB over the wire.

## Performance claims (with sources)

- "60fps panning/zooming across millions of cells" — engineering blog.
- "Loads millions of rows of data in seconds" — quadratichq.com.
- "10–50 draw calls per frame regardless of visible cell count" — engineering blog.

## Recurring weaknesses (GitHub issues, Reddit)

- **Source-available license** — not MIT/Apache; cannot legally vendor the code into a competing hosted product. For oneGrid, this means Quadratic is a *reference architecture*, not a code-borrowing source.
- **Accessibility gap** — WebGL canvas rendering makes screen-reader and keyboard a11y substantially harder than DOM grids. This is the recurring tradeoff of the WebGL choice and applies to oneGrid by extension.
- **Initial load size** — multi-MB WASM bundles (Rust core + CPython) make first paint slow on cold loads.
- **Browser feature requirements** — needs cross-origin isolation (COOP/COEP headers) for SharedArrayBuffer-backed paths; deployment friction.
- **WebGL fallback** — no DOM fallback; if WebGL is unavailable, the app doesn't run.
- **Public docs are thin** on the graph algorithm and the exact tile-paging policy. Most architectural detail comes from blog posts and one Rust-magazine interview, not formal design docs.

## Source URLs read

- https://quadratichq.com/
- https://www.quadratichq.com/blog/building-a-high-performance-spreadsheet-renderer-why-we-chose-webgl-over-html
- https://www.quadratichq.com/blog/building-a-modern-web-application-architecture
- https://filtra.io/rust/interviews/quadratic-aug-24
- https://news.ycombinator.com/item?id=35456509
- https://github.com/quadratichq/quadratic
- https://github.com/quadratichq/quadratic-selfhost
- https://docs.quadratichq.com/
- https://www.quadratichq.com/blog/streamline-spreadsheets-with-quadratics-ai-formula-generator
