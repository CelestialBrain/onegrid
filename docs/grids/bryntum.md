# Bryntum Grid

**Source**: https://bryntum.com/products/grid/
**Repo**: Private; npm packages distributed (`@bryntum/grid`, `@bryntum/grid-react`, etc.) under license.
**License**: Commercial, perpetual + maintenance subscription. **30-day free trial**. Source code shipped with all licenses.
**Pricing** (per bryntum.com/store/grid/, 2026):
- **Single EUL** — for unfunded startups (<10 employees, <$1M ARR). Same per-developer terms.
- **Small Team EUL** — **$680 per developer / yr**, minimum **3 developers** ($2,040 minimum). Perpetual license + 1 yr free upgrades + Standard support.
- **Large Team EUL** — **$600 per developer / yr**, minimum **10 developers** ($6,000 minimum). Perpetual + 1 yr upgrades + Premium support.
- **OEM License** — required for SaaS / commercially redistributed apps. Quote-only.
- **Bundle license** — buy Grid + Scheduler + Gantt + Calendar + TaskBoard at suite discount.
- Discounts: **30% off** for charity/education, **15% off** for blog post, additional startup discounts on inquiry.
- Subscription auto-renews unless cancelled.
**Latest version**: 7.2.x (latest 7.2.4 — April 27, 2026 per Bryntum site).
**Maintenance**: Very active. Multiple minor releases per quarter.

## Architecture
Pure JavaScript / TypeScript framework-agnostic. DOM rendering with row virtualization and minimal DOM updates ("element reuse"). Modern CSS (custom properties, container queries) used for performance. Bryntum's underlying engine is shared across Grid, Scheduler, Scheduler Pro, Gantt, Calendar, and TaskBoard — features (column types, editors, filters, drag-drop) reused across products.

## Framework support
- **Vanilla JS / TypeScript** — native, primary.
- **React** — first-class wrapper (`@bryntum/grid-react`).
- **Vue 2/3** — first-class wrapper.
- **Angular** — first-class wrapper.
All wrappers are thin; underlying Bryntum engine is identical.

## Features

### Sorting
- Single and multi-column sort.
- Custom sort functions per column.
- Server-side sort via store config.
- Sort indicator UI; toolbar action.

### Filtering
- Header filters (per column input).
- Filter Bar (separate row).
- Filter dialog (multi-condition, AND/OR).
- Built-in filter types: text, number, date, list, boolean, custom.
- Server-side filtering supported.

### Grouping
- Single-level grouping by drag-to-group-bar or context menu.
- **Header grouping** (multi-level column headers).
- Group summary rows.
- Tree-grouping (rows-and-header grouping).

### Pivoting
- Not built-in. Cross-product Bryntum analytics not offered. Pivoting must be done client-side or via separate library.

### Aggregations
- Group summary functions: sum, count, avg, min, max, custom.
- Footer summary across full data.
- Per-column summary configuration.

### Editing
- **Inline cell edit** (single cell click).
- **Docked editor** (cell editor opens in fixed location).
- **Row editor** (entire row at once).
- Editor types: text, number, date, dropdown, combobox, checkbox, custom.
- Validation framework with required/min/max/regex.
- Async validation supported.

### Selection
- Cell, row, multi-row, multi-cell, range selection.
- Keyboard-extended selection.
- Checkbox selection column.

### Clipboard / copy-paste
- Excel-compatible copy/paste of cell ranges.
- Configurable.

### Virtualization
- Row virtualization with element reuse (always on).
- Column virtualization optional.
- Demonstrated with very large datasets in their "big data" demo.

### Accessibility
- WAI-ARIA. Keyboard navigation. Screen reader support documented.
- WCAG 2.1 AA pursued.

### Server-side row model / lazy loading
- AjaxStore with server-side sort/filter/page/group.
- Infinite scroll mode.
- "Lazy loading of large datasets" highlighted.
- Custom store/transport supported.

### Streaming / live updates
- Store CRUD events trigger view updates.
- WebSocket / push via custom store.
- Highlight-on-change cell rendering.

### Formulas / computed cells
- Computed column (`fn` accessor).
- No Excel formula engine in Grid (Scheduler has expression support).

### Theming
- 5 prebuilt themes: Stockholm (default), Classic, Classic-Light, Classic-Dark, Material.
- SCSS source. CSS variables.
- Per-cell, per-row CSS classes.
- Conditional formatting via row/cell renderers.

### Export (CSV, Excel, PDF)
- **PDF Export** feature (server-side renderer; Node service or browser-based via headless engine — see docs).
- **Excel Export** (in-browser, via XLSX library).
- **CSV** built-in.
- Multi-page, header/footer, custom paper size.

### Master / detail
- Nested grid feature (`subGridConfigs`).
- Inline expand renders detail grid.
- Collapsible inline columns.

### Tree data
- TreeGrid mode built-in (`features: { tree: true }`). Tree column, expand/collapse, async node loading, drag-reorder nodes.

### Charts integration
- No built-in chart. Designed to pair with Bryntum's Scheduler/Gantt or external chart libs.

### i18n / RTL
- Localization for 20+ languages.
- Custom locale via `LocaleManager`.
- Full RTL.

### Mobile / touch
- Touch-aware: tap, long-press, drag, swipe.
- Responsive viewport-aware UI.

### Other notable features
- **50+ widgets** (buttons, sliders, menus, toolbars) shared across the suite.
- **Drag-drop rows** within and between grids; integration with Scheduler/Gantt/TaskBoard for cross-component drag.
- **Frozen columns** (left/right pinning).
- **Column reorder, resize, hide/show** with column picker.
- **Column types library**: text, number, date, time, percent, rating, action, template, widget.
- **Cell-level / row-level CSS classes** based on data.
- **Undo/redo** stack.
- **State management** (saveState/restoreState) to localStorage or custom backend.
- **Cross-product features** with Scheduler Pro / Gantt: shared event store, drag rows from grid into a schedule.
- **TimeAxisColumn** (visualize timeline data inside a grid cell).
- **Search feature** with row highlighting.
- **Print to PDF/HTML** with theming preserved.

## API style
TypeScript class-based config. `new Grid({ appendTo, columns, store, features: { sort: true, filter: true, group: true } })`. React wrapper: `<BryntumGrid columns={...} store={store} />` with prop-driven config. Imperative methods on instance via ref.

## Bundle size (if disclosed)
- Bryntum publishes that the core grid is "small and fast" but no specific KB number.
- Estimated 300–500 KB min+gz for the full grid bundle including all features.
- Tree-shaking via per-feature imports for Vanilla TS; framework wrappers are larger.

## Performance claims (with sources)
- "Big data set demo" — millions of rows demonstrated.
- "Minimal DOM interactions and element reuse" emphasized.
- "Modern CSS optimizations" — uses `content-visibility`, `contain` properties.
- 60fps scroll target on modern hardware.

## Notable weaknesses or gotchas
- No pivot grid feature; pivoting is left to user.
- License is per developer, **anyone with source-code access** must hold a license — strict.
- Per-developer fee plus minimum-3-dev floor makes Single-developer hobby/freelance use expensive.
- OEM/SaaS license is quote-only and expensive (typical for the segment, not unique).
- Renewal required for upgrades; perpetual license keeps the version you bought, but new features need re-purchase.
- Bundle size larger than the minimal MIT alternatives because suite components share infrastructure.
- Forum reports occasional issues with Vue 3 + nested grid edge cases.
- Theming via SCSS requires source build.

## Source URLs read
- https://bryntum.com/products/grid/
- https://bryntum.com/store/grid/
- https://bryntum.com/blog/the-best-javascript-data-grids-in-2026/
- https://www.componentsource.com (cross-reference)
- https://www.g2.com/products/bryntum/pricing
