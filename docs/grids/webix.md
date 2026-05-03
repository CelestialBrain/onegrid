# Webix DataTable

**Source**: https://docs.webix.com/datatable__index.html
**Repo**: https://github.com/webix-hub (mostly closed-source; GPL "Standard" build available)
**License**: Dual-license. GPLv3 (Webix Standard) for OSS use, plus a Webix Pro commercial license. DataTable's full feature set (Pivot, Spreadsheet-like math, Tree, Pivot Chart, etc.) requires Pro.
**Pricing** (per webix.com/licenses, retrieved 2026):
- **Standard** (free, GPLv3) — limited widgets; no Pivot, no Pro DataTable add-ons.
- **Custom Pack** — $848/yr, single project, up to 2 developers. Perpetual commercial license, 1 yr updates/support.
- **Company Pack** — $2,499/yr, single project, unlimited developers.
- **DevTeam Pack** — $3,999/yr, unlimited projects, team of 5 developers.
- **Unlim Pack** — $9,499/yr, unlimited projects, unlimited developers.
- All Pro packs are perpetual + 1 yr updates; renewal required for new versions.
- Source-code license available on request (extra fee).
**Latest version**: Webix 11.x (rolling 2025–2026 releases; quarterly).
**Maintenance**: Active. XB Software (Belarus/Cyprus) maintains it.

## Architecture
Pure-JavaScript UI library (~100+ widgets). DataTable is one of the data-presentation widgets. Renders to plain DOM (no canvas). Uses row/column virtualization ("dynamic mode") to keep DOM small while scrolling thousands of records. No virtual DOM; direct DOM manipulation. Widgets are configured via JSON-like objects passed to `webix.ui()`. Event system is an EventEmitter pattern.

## Framework support
- **Vanilla JS / jQuery** — native, primary target.
- **React** — official `webix-react-ui` wrapper; lightweight wrapper that mounts Webix widgets inside React components.
- **Angular** — official Angular wrapper.
- **Vue** — community wrapper.
- **TypeScript** — typings shipped.
Webix UI is not "framework-native"; integrations are wrappers over the underlying jQuery-free library.

## Features

### Sorting
- Single-column sort by clicking header; multi-column sort programmatically.
- Built-in sort types: `int`, `date`, `string`, `string_strict` (case-sensitive), `text`, `server`, `raw`.
- Custom sort functions per column.
- Server-side sort via `sort: "server"`.

### Filtering
- Per-column header filters via `content` parameter: `textFilter`, `selectFilter`, `richSelectFilter`, `numberFilter`, `dateFilter`, `dateRangeFilter`, `multiSelectFilter`, `multiComboFilter`.
- Global `filter()` API for ad-hoc predicates.
- AND logic across columns by default.
- Server-side filtering supported via dynamic loading.

### Grouping
- Single-level grouping by column or custom function.
- `groupBy()` API; collapsible group headers.
- Group footers with aggregate totals.
- Map functions to redefine grouped templates.

### Pivoting
- **Separate Pivot widget** (Pro). Drag-drop axes, multiple measures, totals, filters. Distinct from DataTable.

### Aggregations
- Built-in functors usable in column footer or group footer: `sum`, `min`, `max`, `count`, `avg`, `any`. Custom aggregator functions supported.

### Editing
- Inline editing (click/dblclick).
- Editor types: `text`, `select`, `combo`, `richselect`, `multiselect`, `checkbox`, `inline-checkbox`, `password`, `date`, `popup`, custom editors.
- Validation via `rules` config (built-in `isNotEmpty`, `isEmail`, `isNumber`, regex, custom).
- Math/formula support — cells can reference other cells using `=A1+B1` syntax (Pro Spreadsheet-like math).

### Selection
- Cell, row, column, area, multi-row, multi-cell selection.
- Block selection via mouse drag.
- Configured via `select: "row" | "cell" | "column" | "multiselect"`.

### Clipboard / copy-paste
- Copy (Ctrl+C) and paste (Ctrl+V) supported.
- Excel-style block paste.
- Configurable via `clipboard: "selection" | "block" | "repeat" | "custom"`.

### Virtualization
- Default rendering uses "dynamic mode" for >100 rows: only viewport rows are in DOM. Vertical virtualization is row-windowed; horizontal scrolling renders all columns. Claimed to handle "thousands of records."

### Accessibility
- WAI-ARIA roles on grid, row, columnheader, gridcell.
- Keyboard navigation (arrows, tab, page-up/down, home/end).
- Screen-reader-friendly headers/labels (per docs `accessibility` section).

### Server-side row model / lazy loading
- `webix.proxy()` adapters for REST, GraphQL, server-side filtering/sorting/paging.
- Dynamic loading: data loaded by chunks as user scrolls (`dynamic` data adapter).
- ConnectorSDK for PHP/Node/Java backends.

### Streaming / live updates
- DataCollection layer supports `add`, `update`, `remove`, `move` events. Real-time updates via WebSocket plug-in or manual `dataProcessor` push.

### Formulas / computed cells
- `math` mixin enables Excel-style cell formulas (`=A1*B1`).
- `Spreadsheet` is a separate Pro widget (built atop DataTable) with full formula engine, named ranges, sheets.

### Theming
- 5 prebuilt skins: Material, Mini, Compact, Contrast, Flat.
- Theme builder tool. CSS variables.
- Customizable per-row/per-cell `css` property; conditional formatting.

### Export (CSV, Excel, PDF)
- Built-in export to **Excel (XLSX)**, **PDF**, **CSV**, and **PNG**.
- Server-less (in-browser) using bundled SheetJS-like engine for Excel and pdfmake for PDF.

### Master / detail
- "Subviews" feature: each row can expand into a sub-component (form, sub-grid, chart, custom UI).
- Pairing with separate widget via row click is also a common pattern.

### Tree data
- Separate `treetable` widget (extends DataTable). Hierarchical data, expand/collapse, lazy node loading.

### Charts integration
- Webix Chart widget; commonly paired with DataTable via shared DataCollection. Sparkline columns supported inline.

### i18n / RTL
- Locale files for ~25 languages (date/number formats, button labels).
- RTL via `dir: "rtl"` setting.

### Mobile / touch
- Touch scroll, tap-to-select, long-press menus. Webix has a separate mobile-focused build (`webix.touch.js`).
- Adaptive demos but no auto-responsive grid by default.

### Other notable features
- **Subrows / subviews** (collapsible inline detail).
- **Frozen columns and rows** (`leftSplit`, `rightSplit`, `topSplit`).
- **Colspan / rowspan** in headers and body.
- **Header filters and footer filters** simultaneously.
- **Column drag-reorder, drag-resize, drag-hide**.
- **Column chooser** built-in widget.
- **Sparkline columns**, custom HTML templates.
- **Drag-drop rows** between grids.
- **Undo manager** (Pro).
- **Spreadsheet add-on** (separate widget) for Excel-grade UI.

## API style
JSON-config + imperative methods. A grid is declared by passing a config object to `webix.ui({ view: "datatable", columns: [...], data: [...] })`. Methods on the instance: `grid.sort()`, `grid.filter()`, `grid.add()`, `grid.serialize()`, etc. Event listeners via `grid.attachEvent("onAfterSelect", fn)`. Not declarative-by-React-conventions — wrappers are thin.

## Bundle size (if disclosed)
Full Webix Pro library is ~1.5 MB minified gzipped (estimate; Webix doesn't publish exact numbers). DataTable alone (with dependencies) is roughly ~400 KB min+gz. Tree-shaking is limited because the library uses a single bundle. Standard build is smaller.

## Performance claims (with sources)
- "Very good and fast at handling thousands of records" via dynamic mode (docs landing page).
- DataTable demo loads 100k rows in their site samples.
- No published 1M+ row benchmark.

## Notable weaknesses or gotchas
- Older programming model (jQuery-era JSON config) feels foreign in modern React/Vue projects; wrappers are thin and bypass framework idioms.
- Bundle size is large for a single-grid use case — hard to import only DataTable.
- TypeScript typings exist but are weaker than first-class TS libraries.
- Pro license tied to specific developer counts; OEM/SaaS terms require negotiation.
- 1M+ row scenarios untested; horizontal virtualization is limited (all columns in DOM).
- Rendering DOM-only (no canvas) ceiling is lower than canvas grids for ultra-wide tables.
- Source on GitHub mirrors only the GPL-Standard build; Pro is closed.

## Source URLs read
- https://docs.webix.com/datatable__index.html
- https://docs.webix.com/desktop__datatable.html (404 in fetch; fallback via search)
- https://webix.com/licenses/
- https://docs.webix.com/desktop__filter_sort.html
- https://docs.webix.com/desktop__grouping.html
- https://blog.webix.com/webix-faq-licenses/
- https://github.com/webix-hub/docs (filtering source)
