# Grid.js

**Source**: https://gridjs.io/
**Repo**: https://github.com/grid-js/gridjs
**License**: MIT
**Pricing**: Free.
**Latest version**: 6.2.0 (released 2024-03-03)
**Stars**: ~4.7k
**Maintenance**: **Passive**. Latest release is from March 2024 — over two years old as of mid-2026. Repo is still online and patches occasionally land, but momentum is clearly slow. If oneGrid lists this in a competitive table, it should be flagged as low-velocity.

## Architecture

Lightweight, framework-agnostic table library written in TypeScript (~94% of the codebase). Distributes as one JS bundle plus a CSS file.

Architecturally Grid.js is a **Preact-rendered** component under the hood — it ships with a tiny Preact runtime so the rendered grid is a real component tree, but the library itself is consumable from any framework (or no framework) by instantiating `new Grid({...}).render(container)`.

Core abstraction: a **data pipeline** of pluggable processors. Sort, filter, search, pagination, server requests, and storage are all pipeline steps. Custom processors can be slotted in to extend behavior — this is Grid.js's headline extensibility story.

Rendering: Preact diff against the host DOM container. **No virtualization** — Grid.js renders all rows currently in scope. Pagination is the intended scaling strategy. This is the single biggest architectural difference from RevoGrid/Tabulator/MUI X DataGrid.

State: internal store managed via Preact hooks. Server-mode polls/refetches via the pipeline.

## Framework support

- **Vanilla / VanillaJS**: native (`gridjs`).
- **React**: native wrapper `gridjs-react`.
- **Vue**: native wrapper `gridjs-vue`.
- **Angular**: native wrapper.
- **Preact**: works directly.
- **Svelte / Solid**: no first-party wrapper; instantiate manually.
- **jQuery**: integration documented.

All wrappers are thin — they wrap a single `<Grid />` component that proxies props into the underlying instance.

## Features (be EXHAUSTIVE)

### Sorting
Per-column sort, multi-column sort, custom comparator. Server-side sort mode supported via the data pipeline.

### Filtering
**Search** is the headline filter UI — a single search box that does fuzzy/text match across visible columns or a configured set. Per-column filtering is supported but less prominent than a search-first UX.

### Grouping
Not supported.

### Pivoting
Not supported.

### Aggregations
Not supported as a first-class feature.

### Editing
Not supported. Grid.js is a **read-only display grid**, not an editing grid. This is a major scope decision — distinct from every other library in this inventory.

### Selection
Row selection is supported via plugin/checkbox column, but not range selection or Excel-style cell selection.

### Clipboard / copy-paste
Not built-in.

### Virtualization
**None.** Grid.js renders all in-scope rows. The architectural answer to large datasets is server-side pagination.

### Accessibility
ARIA roles applied. Keyboard navigation for pagination and sort. Lighter than MUI X / AG Grid on a11y depth.

### Server-side row model / lazy loading
Yes — `server` config. Pass URL templates with `{page}`, `{limit}`, `{order}`, `{dir}`, `{search}`. Built-in fetch wrapper with `then`/`handle` hooks. Pagination + server is the intended way to handle datasets larger than a few thousand rows.

### Streaming / live updates
Not supported. Refetch via pipeline only.

### Formulas / computed cells
Cell `formatter` functions for display. No formula language.

### Theming / custom cell renderers
CSS-driven theming with default and "Mermaid"-style themes. Custom cell `formatter` returns Preact `h(...)` virtual nodes — so you can render arbitrary content, but you're authoring against Preact's `h` (or use the JSX bridge in framework wrappers).

### Export
Not built-in.

### Master / detail
Not supported.

### Tree data
Not supported.

### Charts integration
None.

### i18n / RTL
Built-in i18n with bundled locales (added Thai `th_TH` in 6.2.0 along with descending sort fix). RTL support yes.

### Mobile / touch
Default styling is responsive; works on mobile but no dedicated touch mode.

### Other notable features
- **Smallest, simplest API** of any grid in this inventory — `new Grid({columns, data}).render(...)` is the minimum and works.
- **Plugin pipeline** for custom processors.
- **Search** as a first-class concept (debounced text search across columns).

## API style

**Declarative configuration object** + small imperative surface (`render`, `forceRender`, `updateConfig`, `destroy`). TypeScript types shipped. Not headless — comes with default CSS theming. Designed for **simplicity over completeness**.

## Bundle size

Per bundlephobia (historical figures, version 6.x):
- `gridjs`: ~50–60 kB min+gzip including the embedded Preact runtime
- CSS theme: ~10–12 kB

Smaller than Tabulator, much smaller than MUI X DataGrid. Tree-shakeable in modern bundlers; Preact runtime is the single biggest chunk.

## Performance claims (with sources)

- No specific public benchmarks. The library deliberately targets the "small to medium" data range.
- Without virtualization, real-world ceiling is on the order of **1,000–10,000 rows** in client-only mode before paint cost becomes noticeable; server mode is the intended path beyond that.

## Recurring weaknesses (GitHub issues, Reddit)

- **No virtualization** — disqualifies Grid.js for any 10M+ row use case in client-only mode. The whole architecture is built around "page from server".
- **Read-only** — no cell editing, no clipboard paste, no row reordering. Wrong tool for spreadsheet-style work.
- **No grouping / pivot / aggregation / tree data** — display tables only.
- **Stale release cadence** — last release March 2024; at 14+ months without a release as of mid-2026, the project is best described as in maintenance.
- **Search-first UX** doesn't match per-column-filter expectations of enterprise users.
- **Preact runtime embedded** adds bundle weight and a layer of indirection if you're already using React.

## Source URLs read

- https://gridjs.io/
- https://gridjs.io/docs/index
- https://gridjs.io/docs/integrations/react
- https://github.com/grid-js/gridjs
- https://github.com/grid-js/gridjs/releases
