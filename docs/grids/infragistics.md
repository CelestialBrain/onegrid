# Infragistics Ignite UI Grid (igGrid / IgrDataGrid)

**Source**: https://www.infragistics.com/products/ignite-ui-react/react/components/grids/data-grid/overview
**Repo**: https://github.com/IgniteUI/igniteui-react (source visible; commercial).
**License**: Commercial, **per-developer**. Perpetual license + maintenance subscription.
**Pricing** (per infragistics.com/how-to-buy/product-pricing, 2026):
- **Ignite UI** (single platform — React, Angular, Web Components, or Blazor) — **$1,399 per developer / yr** (1-year subscription with one year of standard support and updates).
- **Ignite UI Professional** — **$1,699 per developer / yr** royalty-free; multi-platform; **Priority Support +$300/yr**.
- **Infragistics Ultimate** — bundles Ignite UI plus WinForms / WPF / Mobile + design tools; significantly higher (~$1,995–$2,995/dev range historically).
- Per registered developer (named-user) — same developer can install on multiple machines.
- 1, 2, or 3-year subscription terms; multi-year discounts.
- Royalty-free deployment.
- Free 30-day trial.
**Latest version**: Ignite UI for React 18.x / 19.x (rolling 2025–2026; Infragistics ships 3 release waves per year).
**Maintenance**: Very active.

## Architecture
**Two distinct grid components** in Ignite UI for React:
- **`IgrDataGrid`** — high-performance grid; **canvas-rendered** for the body cells (uses native canvas for fastest scroll; headers and chrome are DOM). Optimized for live/streaming data.
- **`IgrGrid`** — DOM-based feature-rich grid (sort, filter, group, edit, templates).
Plus **`IgrTreeGrid`**, **`IgrHierarchicalGrid`**, **`IgrPivotGrid`** as separate components.
Underlying engine shared with Angular Ignite UI (igniteui-angular) and Web Components.

## Framework support
- **React** — Ignite UI for React (`igniteui-react`).
- **Angular** — Ignite UI for Angular (`igniteui-angular`).
- **Web Components** — `igniteui-webcomponents`.
- **Blazor** — Ignite UI for Blazor.
- (Also WPF / WinForms via separate Infragistics Ultimate.)

## Features (covering both IgrDataGrid and IgrGrid; suite-level)

### Sorting
- Single and multi-column.
- Sort indicator UI.
- Custom comparator.
- Server-side sort via store events.

### Filtering
- **Excel-style filter** (checklist + condition).
- Filter row (input per column).
- Advanced Filtering Dialog with grouped conditions.
- Filter operators per data type.
- Server-side filter.

### Grouping
- Group by row (drag-to-group panel).
- Multi-level grouping with custom comparators.
- Group footer with summaries.
- Group expand/collapse, expand all.
- Lazy load groups.

### Pivoting
- **`IgrPivotGrid`** component — multi-dimensional pivot; row/column dimensions, aggregations, filters; calculated members; conditional formatting.

### Aggregations
- Group footer summaries.
- Total summaries (column footer).
- Built-in: sum, count, avg, min, max, custom.
- Multi-summary per column.

### Editing
- Cell, row, batch (transaction-based with rollback), and templated edit modes.
- Editor types: text, number, date, time, picker, combobox, switch, custom template.
- Validation framework (required, regex, range, custom).
- Transaction service (rollback / commit).

### Selection
- Single, multiple, cell-range, multi-cell.
- Checkbox selection column.
- Range selection drag.
- Keyboard-extended.

### Clipboard / copy-paste
- Excel-compatible copy/paste of cell ranges (in IgrGrid).
- IgrDataGrid (canvas) has more limited paste behavior.

### Virtualization
- **IgrDataGrid: canvas + true row & column virtualization** — designed for very large data (millions claimed in marketing).
- **IgrGrid: DOM virtualization** for body rows.
- Live data updates supported.

### Accessibility
- WAI-ARIA, WCAG 2.1 AA.
- Section 508.
- Full keyboard navigation.
- Screen reader tested.
- (IgrDataGrid's canvas rendering can be a11y-challenging; chrome and headers in DOM mitigate this — verify per-feature in latest docs.)

### Server-side row model / lazy loading
- DataSource pattern; stream-friendly.
- Remote pagination.
- Lazy load with virtual scroll.

### Streaming / live updates
- IgrDataGrid is marketed as **"Real-Time React Tables"** — designed for high-frequency cell updates.
- Cell flash on update.
- Push-friendly data layer.

### Formulas / computed cells
- Computed column via accessor function.
- No Excel-engine in grid (Infragistics has separate Spreadsheet component).

### Theming
- **CSS variables**-based theming.
- Built-in themes: Material, Bootstrap, Fluent, Indigo (proprietary).
- Theme schemas via SCSS.
- App Builder design tool integration.

### Export (CSV, Excel, PDF)
- **CSV Export** built-in.
- **Excel Export** built-in (XLSX with styles).
- **PDF Export** in Angular variant; React export historically through external library — verify current version.

### Master / detail
- **`IgrHierarchicalGrid`** — built-in hierarchical / master-detail (parent grid with child grids per row).

### Tree data
- **`IgrTreeGrid`** — hierarchical tree with full grid features (sort/filter/group/edit/summary/page).

### Charts integration
- Ignite UI Charts component pairs natively; sparkline cell integration.
- Cross-grid+chart linked selection demos.

### i18n / RTL
- 30+ locale resources.
- Custom locales via resource manager.
- Full RTL.

### Mobile / touch
- Touch-aware (tap, long-press, swipe).
- Adaptive on small screens; responsive column hiding.

### Other notable features
- **Column reorder, resize, hide/show, pin (left)**.
- **Multi-row layout** (one row spans multiple visual lines — unique feature).
- **Column groups / multi-row headers**.
- **Conditional formatting** via cellClasses / cellStyles.
- **Row pinning**.
- **Excel-style filtering**.
- **Advanced Filtering Dialog**.
- **State Persistence** (save/restore grid state).
- **Toolbar with built-in actions**: hiding, pinning, grouping, exporter.
- **Cell merging / row-spanning**.
- **Drag-drop rows**.
- **Templating**: cell template, row template, header template, summary template.
- **Server-side virtualization** with large remote datasets.
- **AI-aligned code generation** (recent Infragistics feature for generating Ignite UI code via AI assistants).

## API style
React: declarative `<IgrDataGrid />` / `<IgrGrid />` with `<IgrColumn>` and feature directives. Props for sort/filter/group/select. Imperative methods via ref. Component model resembles Telerik's. Angular variant uses Angular directives; Web Components variant uses standard custom elements.

## Bundle size (if disclosed)
- IgrDataGrid bundle leans on the underlying canvas engine; ~250–400 KB min+gz.
- IgrGrid (DOM-based) similar order.
- Tree-shakable per component.
- Includes a runtime license check (banner if unlicensed).

## Performance claims (with sources)
- Marketed as real-time-capable for streaming workloads (financial trading dashboards, telemetry).
- "Lightning-fast scrolling" with canvas render in IgrDataGrid.
- Million-row scenarios demonstrated in marketing demos.
- 60fps scroll target.

## Notable weaknesses or gotchas
- Two grid components (`IgrDataGrid` vs `IgrGrid`) with overlapping but different feature sets — choosing the right one is non-obvious. Migration between them is non-trivial.
- Canvas rendering in IgrDataGrid trades a11y nuance and CSS-style customization for speed; cell-level style overrides limited.
- Documentation across React / Angular / Web Components / Blazor is uneven; some features documented in Angular but not React.
- Pricing on the higher side ($1,399–$1,699/dev/yr).
- License key validation in runtime; missing → banner.
- Subscription renewal needed for upgrades.
- Bundle size larger than minimal grids; tree-shaking limited by interconnected modules.
- IgrPivotGrid feature parity with React side has historically lagged Angular.

## Source URLs read
- https://www.infragistics.com/products/ignite-ui-react/react/components/grids/data-grid/overview
- https://www.infragistics.com/products/ignite-ui-react/grid-table
- https://www.infragistics.com/products/ignite-ui-react/react/components/grids/tree-grid/overview
- https://www.infragistics.com/products/ignite-ui-react/react/components/grids/pivot-grid/overview
- https://www.infragistics.com/products/ignite-ui-react/react/components/grids/tree-grid/summaries
- https://www.infragistics.com/how-to-buy/product-pricing
- https://www.componentsource.com/product/infragistics-ignite-ui/prices
