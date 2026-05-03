# Tabulator

**Source**: https://tabulator.info/
**Repo**: https://github.com/olifolkerd/tabulator
**License**: MIT
**Pricing**: Free.
**Latest version**: 6.4.0 (released 2026-03-06; "Unit Test & Fixes")
**Stars**: ~7.6k
**Maintenance**: Active, primarily single-maintainer (Oli Folkerd). 4,146+ commits on master, ~373 open issues. Steady patch releases; major version increments are deliberate and infrequent.

## Architecture

Pure vanilla JavaScript library — no framework dependency, no build-step requirement. Distributed as a single `tabulator-tables` npm package or via CDN with a JS file plus CSS theme.

Internally **modular**: features (sort, filter, edit, group, tree, download, format, history, validate, accessibility, persistence, clipboard, ajax, etc.) are implemented as registrable modules. A "modules" subsystem lets you build a custom Tabulator bundle with only the modules you need (custom build option), trimming bundle size.

Rendering uses a **Virtual DOM**-style row recycler. Tabulator describes its rendering as "Lightning fast rendering of large data sets using a virtualized DOM" — vertical row virtualization, columns rendered in full. Two render modes are available (`renderHorizontal: 'virtual'` / `'basic'`), and there's a "spreadsheet" rendering mode for sheet-like layouts.

State is held inside the Tabulator instance; consumers interact through ~200 imperative methods (`addData`, `updateRow`, `setFilter`, `setSort`, `getData`, `download`, etc.) and a comprehensive event system (`rowClick`, `cellEdited`, `dataLoaded`, `rowMoved`, …).

Reactivity: imperative. There is **no prop-based reactive model** — to update the grid you call methods on the table instance. Framework wrappers (community-maintained) bridge to React/Vue/Angular reactive models on top of this.

## Framework support

- **Vanilla JS**: native, the primary target.
- **React**: community wrapper `react-tabulator` (and forks). Not first-party.
- **Vue 2 / Vue 3**: community wrappers (`vue-tabulator`).
- **Angular**: community wrappers (`ngx-tabulator`, `angular-tabulator`).
- **Svelte / Solid / Qwik**: no first-party wrapper; usable directly with imperative API in `onMount`.

The lack of first-party framework wrappers is a real ergonomic gap in 2026.

## Features (be EXHAUSTIVE)

### Sorting
Single and multi-column sort, header click and programmatic, custom sorters per column type (number, string, date, boolean, alphanum, exists, array, etc.).

### Filtering
Per-column header filters, programmatic filters (`setFilter`), filter operators (`=`, `!=`, `like`, `<`, `>`, `<=`, `>=`, `in`, `regex`, `starts`, `ends`, `keywords`, custom function). Multi-filter logic via filter arrays.

### Grouping
Single and multi-level row grouping with custom group headers, group toggling, group sort. `groupBy` accepts a field, an array, or a function.

### Pivoting
Not built-in. Achievable manually via grouping + column calcs but not a first-class feature.

### Aggregations
**Column calculations** — built-in calc functions (sum, avg, max, min, count, concat) rendered in top/bottom calc rows or per-group footer. Custom calc functions supported.

### Editing
Per-cell editors: `input`, `textarea`, `number`, `range`, `tickCross`, `star`, `progress`, `select`/`list` with autocomplete, `date`, `time`, `datetime`, custom editor functions. Validators per column (`required`, `unique`, `integer`, `float`, `numeric`, `string`, `min`, `max`, `minLength`, `maxLength`, `in`, `regex`, custom). Edit lifecycle: `cellEditing`, `cellEdited`, `cellEditCancelled`. **Undo/redo history** module records edits and can replay/reverse.

### Selection
Row selection (single, multi, rangeMode), cell range selection (Excel-style multi-range), keyboard navigation. `selectRow` / `deselectRow` / `getSelectedRows` API.

### Clipboard / copy-paste
Built-in clipboard module: copy formatted, copy with headers, paste with parser (`tab`, `csv`, `clipboard`, custom). Configurable copy/paste roles per column.

### Virtualization
Virtual DOM row recycling for vertical scroll. Horizontal can be `virtual` or `basic`. Pagination is the recommended approach for very large datasets — virtual scroll alone is the historical weak point (see weaknesses).

### Accessibility
ARIA tags applied to grid roles, headers, rows, cells. Keyboard shortcuts (configurable `keybindings`). Print styling included.

### Server-side row model / lazy loading
**Ajax** module supports remote data with server-side sort, filter, pagination — all configurable. **Progressive loading** mode loads pages on scroll. Not as polished as MUI X / AG Grid Enterprise's data source abstractions but covers the common patterns.

### Streaming / live updates
Imperative `updateData`, `updateOrAddData`, `addData`. No first-party pub/sub or WebSocket integration; integrate manually.

### Formulas / computed cells
**Mutators** transform data into and out of the grid. **Formatters** transform display. No spreadsheet formula language.

### Theming / custom cell renderers
Five packaged themes (default, simple, midnight, modern, site, Bootstrap 4/5, Materialize, Semantic UI, Bulma). **Formatters**: ~30 built-in (`plaintext`, `textarea`, `html`, `money`, `image`, `link`, `tickCross`, `star`, `progress`, `color`, `buttonTick`, `buttonCross`, `rownum`, `handle`, `responsiveCollapse`, `lookup`, `array`, `json`, `datetime`, `datetimediff`, custom). Cell-level custom HTML.

### Export
**Downloads**: CSV, JSON, XLSX (via SheetJS), PDF (via jsPDF), HTML. Print to printer with print-only styling and per-column print visibility. **Imports** (since 6.x): xlsx, csv, ods.

### Master / detail
Implementable via row formatter + custom HTML; not a built-in module.

### Tree data
Built-in **dataTree** module: parent-child rows, expand/collapse, branch-aware sort/filter. Async children loading possible.

### Charts integration
None first-party; embed via custom formatters.

### i18n / RTL
Localization for column headers, pagination, group headers via `langs` config. **RTL** layout supported.

### Mobile / touch
"Fully functional on mobile touch devices" — touch select, drag, scroll. **Responsive layout** module hides columns on narrow viewports with a collapse toggle.

### Other notable features
- **History** module — undo/redo for edits and structural changes
- **Persistence** module — save column order/widths/visibility/sort/filter to localStorage or remote
- **Frozen / sticky columns and rows**
- **Movable rows and columns** (drag handles)
- **Pagination** (local and remote)
- **Spreadsheet mode** (multi-sheet tabs, sheet management)
- **File import** (xlsx, csv, ods) — distinctive, most grids only export
- **Persistence cookies / localStorage / remote-driven config**
- **Print-only styling**

## API style

**Imperative-first**, with config-object initialization. TypeScript types ship in the package (community-improved). Not headless — strongly batteries-included with default styling and behavior. Customizing internals means using the documented modules and lifecycle hooks rather than composing primitives.

## Bundle size

Full build (`tabulator.min.js`) ~340 kB / ~95 kB gzip plus CSS theme (~25–40 kB raw). **Custom builds** can drop to ~120–150 kB by stripping unused modules — Tabulator's most-distinguishing bundle property is that you can opt out of the modules you don't need at build time.

## Performance claims (with sources)

- "Lightning fast rendering of large data sets using a virtualized DOM" (homepage).
- Practical benchmarks from issue threads place comfort zone at "low tens of thousands" of rows in virtual scroll mode; beyond that, paginated/progressive loading is required.

## Recurring weaknesses (GitHub issues, Reddit)

- **Scroll performance with large datasets** is laggy/jumpy (issue #2185). Non-passive event listeners cited as a cause.
- **Memory at ~4,000 rows** can climb to ~1.5 GB depending on formatters (issue #1288).
- **`addData()` slow with large chunks** — adding thousands of rows is reported to take many seconds (issue #747).
- **Initial render of ~1,400-row tables** has caused excessive memory consumption / failure to render in some configurations (issue #1090).
- **Toggling many columns' visibility** degrades with column count (issue #3728).
- **No first-party framework wrappers** in 2026 — community wrappers exist for React/Vue/Angular but quality and update cadence vary.
- **Imperative API** clashes with reactive frameworks; you end up double-buffering state.
- **Bus factor** — single primary maintainer.
- **Documentation site** (tabulator.info) is feature-complete but UX is dated; finding specific options across modules can be slow.

## Source URLs read

- https://tabulator.info/
- https://tabulator.info/docs/6.4
- https://github.com/olifolkerd/tabulator
- https://github.com/olifolkerd/tabulator/issues/97
- https://github.com/olifolkerd/tabulator/issues/254
- https://github.com/olifolkerd/tabulator/issues/747
- https://github.com/olifolkerd/tabulator/issues/1032
- https://github.com/olifolkerd/tabulator/issues/1090
- https://github.com/olifolkerd/tabulator/issues/1288
- https://github.com/olifolkerd/tabulator/issues/2185
- https://github.com/olifolkerd/tabulator/issues/2625
- https://github.com/olifolkerd/tabulator/issues/3728
