# Syncfusion DataGrid

**Source**: https://ej2.syncfusion.com/react/documentation/grid/getting-started
**Repo**: https://github.com/syncfusion/ej2-javascript-ui-controls (source visible; build closed)
**License**: Commercial. Free **Community License** for individuals/companies under $1M revenue, ≤5 devs, ≤10 employees.
**Pricing** (per syncfusion.com/sales/pricing, 2026):
- **Community License** — $0; revenue <$1M, ≤5 devs, ≤10 employees, externally funded must have <$3M VC funding.
- **Team License (Timed Subscription, per developer/yr)** — Syncfusion does not publish per-dev cost on the page; quotes only. Reseller (ComponentSource) lists Essential Studio JS new license starting around the **mid-$1,000s/dev** historical band. Essential Studio Enterprise starts considerably higher.
- Subscription is **timed** (must renew to continue using the software after 1 year).
- Monthly or annual billing; minimum 1-year term.
- Auto-renewal until cancelled.
- Volume discounts standard above 5 developers.
- Includes priority SLA support, unlimited tickets, royalty-free deployment.
**Latest version**: EJ2 v32.x (Q1 2026; Syncfusion ships ~4 major releases/yr).
**Maintenance**: Very active. Syncfusion ships volume releases (4 per year) plus weekly service packs.

## Architecture
EJ2 (Essential JS 2) is the modern stack — TypeScript-first, framework-native components. The Grid is a DOM-rendered virtualized table. Module-based feature-injection pattern: each capability (Sort, Filter, Group, Edit, Page, Reorder, Resize, etc.) is a module you opt into. Reduces bundle size when only some features are used.

## Framework support
- **JavaScript / TypeScript** — native (`@syncfusion/ej2-grids`).
- **React** — native wrappers (`@syncfusion/ej2-react-grids`); idiomatic JSX with `<GridComponent>` and `<ColumnsDirective>`.
- **Angular** — native wrappers.
- **Vue 2/3** — native wrappers.
- **Blazor** — separate but feature-parity.
- **ASP.NET MVC / Core** — server-side wrappers.
- **Web Components** — packaged separately.

## Features

### Sorting
- Single and multi-column sorting (Shift+click).
- Programmatic `sortColumn()` API.
- `allowSorting` flag; `sortSettings` config.
- Custom comparator per column.
- Server-side sort via OData/UrlAdaptor.

### Filtering
- Filter modes: **Filter Bar** (input row), **Menu** (dropdown), **Excel** (checklist + condition), **Checkbox**.
- Operators: equals, contains, startswith, endswith, greaterThan, lessThan, between, etc.
- Filter templates and predicate API.
- Server-side filtering across all modes.

### Grouping
- Multi-level grouping (drag column to group panel).
- Lazy load grouping (groups loaded on expand).
- Group caption template, group footer, group expand/collapse all.
- Server-side grouping with virtual scrolling.

### Pivoting
- **Separate Pivot Table component** — drag-drop axes, multi-measure, OLAP / cube data, server-side aggregation, virtualization, conditional formatting, drill-through, calculated fields.

### Aggregations
- Built-in: sum, average, min, max, count, true count, false count, custom.
- Total aggregates (footer) and group aggregates (group footer).
- Multiple aggregates per column.

### Editing
- Edit modes: **Inline / Normal**, **Dialog**, **Batch** (Excel-like multi-edit), **Cell**, **Command Column**.
- Edit types: dropdown, datepicker, numeric textbox, custom template, autocomplete.
- Validation via Form Validator (required, regex, ranges).
- CRUD wired to `DataManager` (REST/OData).
- Add/edit/delete with toolbar buttons.

### Selection
- Cell, row, column, multi-cell, multi-row.
- Checkbox selection column.
- Persist selection across pages.
- `selectionSettings.type: 'Single' | 'Multiple'`, `mode: 'Row' | 'Cell' | 'Both'`.

### Clipboard / copy-paste
- Copy (Ctrl+C) selection or full grid.
- Auto-fill (Excel-style fill handle).
- Paste behavior configurable.

### Virtualization
- **Row virtualization** (vertical) and **column virtualization** (horizontal).
- **Infinite scrolling**.
- **Virtual scrolling with grouping**.
- Tested with 100k+ rows in samples.

### Accessibility
- WAI-ARIA compliant. WCAG 2.1 AA.
- Section 508.
- Full keyboard navigation: arrows, Tab, Enter, F2 (edit), Esc, Ctrl+Home/End, Page Up/Down, Shift-select, Ctrl-select.
- Screen reader (NVDA/JAWS) tested.
- High-contrast theme.

### Server-side row model / lazy loading
- `DataManager` with adaptors: ODataV4, OData, URL, WebApi, Json, RemoteSaveAdaptor, custom.
- Server-side paging, sorting, filtering, grouping, aggregation.
- **Virtual scrolling with remote data**.
- **Lazy load grouping**.
- **Infinite scroll mode**.

### Streaming / live updates
- DataManager supports observable arrays; explicit `refresh()` and CRUD APIs. SignalR samples documented for real-time push. No first-class push API.

### Formulas / computed cells
- DataGrid does not have an Excel formula engine, but Syncfusion ships a separate **Spreadsheet** component with full formula support.
- Computed columns possible via `valueAccessor` callback.

### Theming
- Built-in themes: Material 3, Material, Bootstrap 5, Bootstrap 4, Tailwind CSS, Fluent, Fabric, High Contrast.
- Theme Studio (online tool) for custom palettes.
- SCSS source for theming.

### Export (CSV, Excel, PDF)
- Built-in **Excel (XLSX)**, **PDF**, **CSV** export.
- Style export (cell formatting), header/footer, multiple grids per workbook, hierarchical/grouped export, server-side export available.

### Master / detail
- `detailTemplate` slot — custom content per row.
- Hierarchical grids: master grid renders detail grid bound to child datasource.

### Tree data
- **Separate TreeGrid component** with full feature parity (sort, filter, group, virtual scroll, edit, page, drag/drop nodes).

### Charts integration
- No inline grid chart, but Syncfusion Charts component pairs naturally — common pattern in samples. Sparkline column type supported inline.

### i18n / RTL
- Localization for 30+ languages built-in. Custom locale via `L10n.load()`.
- Globalization (CLDR) for date/number formatting.
- Full RTL support via `enableRtl: true`.

### Mobile / touch
- Touch-optimized interactions: swipe to sort/group, long-press context menu, pinch-zoom unsupported.
- Responsive adaptive rendering (`enableAdaptiveUI`) — switches to mobile-friendly UI on small screens.

### Other notable features
- **Column chooser** built-in.
- **Column reorder, resize, freeze (left/right)**.
- **Frozen rows and columns**.
- **Context menu, command column, toolbar**.
- **State persistence** to localStorage.
- **Excel-like filter** with checklist.
- **Stacked headers** (multi-level header).
- **Foreign key column** (lookup another dataset).
- **Conditional formatting** via cell template.
- **Print with custom layout**.
- **Drag-drop rows** between grids.
- **Clipboard auto-fill**.
- **Search panel** (global search).
- **Pager dropdown / pager templates**.
- **AI integration** (`SmartPaste`, AI assistant column — recent additions).

## API style
React: declarative JSX with `<GridComponent>` and `<ColumnsDirective>` / `<ColumnDirective>`. Features enabled via boolean props (`allowPaging`, `allowSorting`, etc.) and registered modules via `Inject` directive. Imperative methods via ref. Vanilla TS: imperative `new Grid({ ... })`.

## Bundle size (if disclosed)
- Modular: only injected modules ship. Base grid ~80–120 KB min+gz; full feature set ~250–350 KB min+gz.
- Tree-shakable via individual module imports.

## Performance claims (with sources)
- Virtual scroll with 100k+ rows demonstrated in samples; lazy-load grouping for unbounded data.
- "Designed for high-performance enterprise applications."
- No published 1M+ in-browser benchmark.

## Notable weaknesses or gotchas
- License compliance enforced via run-time license key (`registerLicense`). Forgetting it triggers a banner in production.
- "1,600+ components" suite — bundle size baseline larger than slim grids.
- API surface large; learning curve.
- Pricing not public; sales-call required for exact quote.
- Subscriptions are timed (don't pay → cannot use newest builds).
- Some advanced features (like Excel-like filter with grouping virtualization) have edge-case bugs reported in forum.
- Documentation good but framework-specific docs duplicate; finding "is this React or Vanilla" can be confusing.

## Source URLs read
- https://ej2.syncfusion.com/react/documentation/grid/getting-started
- https://www.syncfusion.com/sales/pricing
- https://www.syncfusion.com/products/communitylicense
- https://www.componentsource.com/product/essential-studio-for-javascript/prices
- https://github.com/syncfusion/ej2-javascript-ui-controls (release notes)
