# Perspective (FINOS)

**Source**: https://perspective.finos.org/ (redirects to https://perspective-dev.github.io/)
**Repo**: https://github.com/finos/perspective
**License**: **Apache-2.0**
**Pricing**: Free, OSS. Stewarded by the **OpenJS Foundation** (FINOS-incubated, governance now via OpenJS).
**Latest version**: v4.4.1 (released 2026-04-14, per GitHub releases). Note: npm publish for `@finos/perspective` lags GitHub — last npm publish observed at 3.8.0 ~7 months before, with 4.x released directly via the dev fork's namespace.
**Stars**: ~10.5k
**Maintenance**: Active. Multi-contributor. Backed by OpenJS Foundation governance.

## Architecture

This is the most architecturally distinct library in this inventory and the closest existing reference for oneGrid's intended engine layer.

### Core engine
- Streaming query engine written in **C++** (~33% of the codebase) **and Rust** (~32%), compiled to:
  - **WebAssembly** for in-browser use
  - **Native Python** binary for Python use
  - **Native Rust** crate
  - **Node.js** native build
- The engine is **columnar**, with all data stored in **Apache Arrow** format (read/write/streaming/IPC). This means data crosses the language boundary as zero-copy Arrow IPC buffers — the same bytes pass between the WASM heap, Python pandas, and a server.
- Custom columnar **expression language based on ExprTK** — high-performance, vectorized expressions evaluated inside the engine. This is how Perspective implements computed columns, filters, and aggregates without round-tripping to JS.

### Threading model
- Browser: engine runs in a **Web Worker**, freeing the main thread for the UI. Communication is via `MessageChannel`-style RPC; large data transfers use Arrow IPC over `Transferable` ArrayBuffers.
- Python/Node: engine runs in-process; the API is identical.

### UI layer
- Framework-agnostic **Custom Element**: `<perspective-viewer>`. Drop into any framework's DOM and connect to a `Table` instance from the engine.
- The viewer is a **shell** — actual rendering of cells and charts is delegated to **plugins**:
  - `perspective-viewer-datagrid` — the high-performance virtual datagrid (`regular-table` based)
  - `perspective-viewer-d3fc` — D3FC-based charts (10+ chart types: bar, line, area, scatter, heatmap, candlestick, sunburst, treemap, OHLC, etc.)
  - Pluggable Data Model API for custom plugins (e.g., DuckDB, ClickHouse virtual server connectors)

### Server modes
- **Python**: aiohttp, Starlette, Tornado handlers; production-grade WebSocket server.
- **Node.js**: WebSocket server.
- **Rust**: Native server.
- **Virtual server**: connect to **DuckDB** or **ClickHouse** as the backing engine — Perspective acts as the UI layer over an external database with Arrow flight-style streaming.

### Reactivity / streaming
- `Table.update()` streams new rows; the engine maintains all derived `View`s incrementally — pivots, filters, sorts, aggregates recompute on the delta, not from scratch.
- Multiple `View`s on a single `Table` for cross-filtered dashboards.

## Framework support

- **Vanilla / Web Component**: native, primary integration surface.
- **React**: works via the Custom Element; no first-party React wrapper but trivial to wrap.
- **Vue / Angular / Svelte**: same — Custom Element integration.
- **Python**: native bindings, JupyterLab widget (`perspective-jupyterlab`), Pandas/Arrow interop.
- **Node.js**: native bindings.

The framework-agnostic Web Component is the canonical answer; framework wrappers are thin and largely community-built.

## Features (be EXHAUSTIVE)

### Sorting
Single and multi-column, ascending/descending, abs-value sort, custom orderings.

### Filtering
Predicate filters per column with all standard operators; expression-based filters via ExprTK; multi-condition filters; cross-filter via shared `Table` and multiple `View`s.

### Grouping
Row grouping (by any number of fields), column grouping (split-by). Groups expand/collapse. Built into the engine — grouping is a `View` configuration, recomputed incrementally on data updates.

### Pivoting
**First-class.** Pivot by rows and columns simultaneously with arbitrary depth. The pivot UI in `<perspective-viewer>` has a drag-and-drop config panel. Pivots recompute incrementally on streaming updates. **This is Perspective's signature feature** and the reason it's used in finance dashboards.

### Aggregations
Engine-level: `sum`, `avg`, `count`, `count distinct`, `dominant`, `first`, `last`, `min`, `max`, `mean`, `median`, `pct sum parent`, `pct sum grand total`, `stddev`, `var`, `weighted mean`, `low`, `high`, `unique`, `distinct count`, custom expression aggregates. Per-column override.

### Editing
The datagrid plugin supports cell editing that round-trips to the engine via `Table.update()`. More limited than dedicated editing grids — not the primary use case.

### Selection
Cell and range selection in the datagrid plugin. Row selection.

### Clipboard / copy-paste
Copy supported. Paste limited.

### Virtualization
The `perspective-viewer-datagrid` plugin is built on `regular-table`, which is a **lazy data-on-demand virtual table** — it requests only the visible window from the engine on each scroll/resize. Combined with the WASM engine, this is what lets Perspective handle datasets larger than browser memory by holding the engine's columnar store in WASM memory and never materializing the rendered HTML for off-screen cells.

### Accessibility
ARIA roles. Less aggressive a11y story than MUI X — Perspective's primary audience is analyst dashboards, not form-driven apps.

### Server-side row model / lazy loading
Yes — `<perspective-viewer>` connecting to a Python/Node/Rust server runs all queries on the server and pulls Arrow IPC chunks down on demand. Virtual server connectors (DuckDB, ClickHouse) push compute even further out.

### Streaming / live updates
**Best-in-class.** `Table.update()` accepts deltas; `View` recomputes incrementally; UI re-renders only changed cells. Designed from day one for streaming financial market data.

### Formulas / computed cells
**Yes** — ExprTK-based columnar expression language. Define computed columns inline; expressions are vectorized and evaluated in the WASM engine, not in JS.

### Theming / custom cell renderers
CSS-variable-based themes (light, dark, "Pro" variants). Custom cell formatters in the datagrid plugin. Plugin authors can ship entirely new visual representations.

### Export
CSV, JSON, Apache Arrow IPC export from any `View`. Direct Arrow export is the differentiator — round-trip to other tools (Pandas, DuckDB, Polars) without re-parsing.

### Master / detail
Not built-in.

### Tree data
Hierarchical row grouping serves the tree-data role. Tree-style data in flat columnar form via parent-id columns.

### Charts integration
**Built-in.** `perspective-viewer-d3fc` provides 10+ interactive chart types backed by D3FC. Cross-filters between datagrid and chart views on the same `Table`. **Perspective Workspace** (`@finos/perspective-workspace`) is a multi-pane dashboard layout that lets users compose datagrids and charts into linked workspaces.

### i18n / RTL
Limited — primarily English-language analyst tooling.

### Mobile / touch
Functional but desktop-oriented.

### Other notable features
- **Apache Arrow** as the native data format — the only grid in this inventory that speaks Arrow IPC end-to-end.
- **JupyterLab integration** — `perspective-jupyterlab` widget for Pandas/Arrow DataFrames.
- **CLI** — `@finos/perspective-cli` to view CSV/Arrow files in a browser instantly.
- **Workspace** — multi-pane linked dashboards.
- **Virtual server** — DuckDB / ClickHouse backing.

## API style

Imperative engine API (`Table`, `View`, `update`, `delete`, `to_arrow`, `to_csv`, `to_json`) wrapped by a declarative Custom Element (`<perspective-viewer>` configured via attributes / restored from a `save()`/`restore()` JSON snapshot). TypeScript types shipped. Decidedly **not headless** at the viewer level, but the engine itself **is headless** — you can use the WASM engine standalone and render with whatever UI you want. This headless-engine-plus-pluggable-UI separation is the architectural pattern most relevant to oneGrid.

## Bundle size

Substantial. The all-in-one `@finos/perspective-viewer` plus engine WASM is heavy:
- Engine WASM (`psp.async.wasm`): ~1.5–2 MB raw, ~600–700 kB gzip
- Viewer JS: ~150–200 kB min+gzip
- Datagrid plugin: additional ~30 kB gzip
- D3FC chart plugin: additional ~250 kB gzip

The default inline-WASM build is ~500 kB **larger** than the split build because of base64 encoding overhead. The **`@finos/perspective-webpack-plugin`** outputs `psp.async.wasm` and `perspective.wasm.worker.js` as separate files — significantly faster initial loads. Tree-shakeable at the plugin level (don't import D3FC charts if you don't use them).

## Performance claims (with sources)

- "Interactive analytics and data visualization component for large and streaming datasets" — homepage.
- Designed for finance market-data feeds: tens of thousands of updates/sec on streaming `Table.update()`.
- Public benchmarks discussion: https://github.com/finos/perspective/discussions/1659.
- 10–100M-row datasets feasible when paired with the Python/Rust server or virtual DuckDB/ClickHouse server.

## Recurring weaknesses (GitHub issues, Reddit)

- **Bundle size and load time** — the default inline-WASM build is heavy and can stall first paint. The split-WASM webpack plugin solves this but adds build complexity.
- **Build tool integration pain** — Vite and Next.js integrations have repeatedly broken across versions. Top-level await + WASM workers are not gracefully supported by all bundlers (issues #2135, #2795, discussion #1367, #2716 announcing v3 breaking changes).
- **`finos/perspective` vs. `perspective-dev/perspective` confusion** — the repository moved/forked at points; npm publishing has lagged the dev fork's tags. Users routinely hit version mismatches.
- **Steep learning curve** — `Table` / `View` / Arrow / ExprTK is a deep stack. Quick wins are hard.
- **Editing UX** is secondary; not the right grid for spreadsheet-like input workflows.
- **Theming is opinionated** — designed for analyst dashboards, retheming for general business apps takes effort.
- **Browser memory ceiling** — datasets must fit in WASM memory if running purely in-browser; very large data requires the server modes.

## Source URLs read

- https://perspective.finos.org/
- https://perspective-dev.github.io/
- https://github.com/finos/perspective
- https://github.com/finos/perspective/discussions/1659
- https://github.com/finos/perspective/discussions/2716
- https://github.com/finos/perspective/issues/2795
- https://github.com/finos/perspective/discussions/1367
- https://github.com/finos/perspective/discussions/2135
- https://github.com/finos/perspective/issues/1201
- https://www.npmjs.com/package/@finos/perspective
- https://www.npmjs.com/package/@finos/perspective-viewer
