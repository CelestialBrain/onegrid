# DevExtreme DataGrid (DevExpress)

**Source**: https://js.devexpress.com/Documentation/Guide/UI_Components/DataGrid/
**Repo**: https://github.com/DevExpress/DevExtreme (source visible; license commercial).
**License**: Commercial, **per-developer subscription**, 12-month term. Royalty-free deployment.
**Pricing** (per js.devexpress.com/Buy + componentsource.com, 2026):
- **DevExtreme Complete (JavaScript)** — starts ~**$881.99 per developer**, 1-year subscription (reseller list, April 2026). DevExpress official site lists at the same band; volume discounts apply.
- **DevExpress Universal** — bundles DevExtreme with .NET/WinForms/WPF/Blazor; from ~**$2,253.99 per developer** (includes everything).
- Volume discounts: **5% (2–5)**, **10% (6–10)**, **15% (11+)**.
- Renewal ~50% of new-license price.
- Subscription model: each developer with code access needs a license.
- 30-day free trial.
**Latest version**: DevExtreme 24.x / 25.x (DevExpress major versions ship 2x/yr — v24.1, v24.2, v25.1 etc., minor "v25.x.x" service builds throughout).
**Maintenance**: Very active.

## Architecture
JavaScript-vendor-agnostic library (TypeScript-first). The DataGrid is one component in a 70+-component suite. DOM rendering with virtual + infinite scroll modes. Internal data layer (`DataSource` + `Store`) abstracts local arrays, REST endpoints, OData, and custom backends. Module-imported features. Renders to plain DOM; no canvas.

## Framework support
- **Vanilla / jQuery** — primary distribution (`devextreme`).
- **Angular** — `devextreme-angular` (native wrappers).
- **React** — `devextreme-react` (native wrappers).
- **Vue 2/3** — `devextreme-vue`.
- **ASP.NET Core / MVC** — server-side wrappers.

## Features

### Sorting
- Single + multi-column.
- Custom comparators.
- Server-side sort via DataSource.

### Filtering
- **Filter Row**, **Header Filter**, **Filter Builder** (rich condition builder), **Search Panel** (global).
- Operators per data type (Equals, Contains, Between, Not, And/Or trees).
- Custom filter operations and editors.
- Server-side filter via OData / CustomStore.

### Grouping
- Multi-level grouping (group panel + drag).
- Grouped continued-by-page rendering.
- Group footer with summaries.
- Lazy load groups.
- Auto-expand-all option.

### Pivoting
- **Separate PivotGrid component** — drag-drop fields, OLAP support (MS SSAS), cube data, **client-side engine that handles up to 1M records** (per DevExpress claim), drill-down, calculated fields, conditional formatting, virtualization, integrated FieldChooser.

### Aggregations
- **Total Summaries** (footer).
- **Group Summaries** (per group).
- Built-in: sum, count, min, max, avg, custom.
- Multiple summaries per column.
- Summary alignment / display formats.

### Editing
- Edit modes: **Batch** (Excel-like multi-edit + commit), **Cell**, **Row**, **Popup**, **Form**.
- Editor types: text, numeric, date, dropdown, lookup, checkbox, custom template.
- Cascading lookups.
- Validation (required, range, regex, custom, async).
- Add/remove with undo.

### Selection
- Single, multiple, cell-range.
- Checkbox column.
- Persist selection across pages.
- "Show check boxes mode": always / on click / on long tap / never.
- Range selection drag.

### Clipboard / copy-paste
- Copy + paste in **batch edit** mode (Excel-compatible).
- Paste into selected range.

### Virtualization
- **Virtual scrolling** (rows + columns).
- **Infinite scrolling** mode.
- Standard scrolling for small data.
- Combined with grouping.

### Accessibility
- WAI-ARIA grid pattern.
- Section 508 / WCAG 2.1 AA.
- Full keyboard navigation.
- Tested with screen readers.
- High-contrast theme.

### Server-side row model / lazy loading
- `CustomStore` interface — implement load/insert/update/remove.
- `DataSource` wraps CustomStore + paging/sorting/filtering/grouping with server-side pushdown.
- ODataStore + ArrayStore + LocalStore built-in.
- Server-side aggregation supported.

### Streaming / live updates
- **Push API** (`pushAggregationTimeout`, `dataSource.push([...])`) — real-time inserts/updates/deletes with deduplication and re-render minimization.
- Cell-flash on change (custom render).

### Formulas / computed cells
- `calculateCellValue` + `calculateDisplayValue` per column for computed fields.
- No Excel formula engine in DataGrid (DevExtreme also has Spreadsheet component).

### Theming
- Themes: Generic (light/dark + variants), **Material** (light/dark/teal/orange/blue/purple), **Bootstrap 4 / 5**, **Fluent**.
- ThemeBuilder online tool.
- SCSS source.
- CSS variables.
- Per-cell / row CSS class via `cellPrepared` / `rowPrepared` events.

### Export (CSV, Excel, PDF)
- **Excel Export** (`exportDataGrid`) via ExcelJS — full styling, multi-sheet, conditional, headers/footers.
- **PDF Export** via jsPDF/pdfMake — autoTable, multi-page.
- **CSV** via Excel export.
- Export selected rows, grouped data, hidden columns toggle.

### Master / detail
- `masterDetail` template — custom JSX/HTML / nested DataGrid.
- Multi-level master-detail.

### Tree data
- **Separate TreeList component** — full feature parity (sort, filter, group, edit modes Batch/Cell/Row/Popup/Form, virtual scroll, focused row, drag-drop nodes, async node load).

### Charts integration
- DevExtreme Charts component pairs naturally; integrated demos. Sparkline column inline.

### i18n / RTL
- Globalize.js + CLDR locales (40+ languages).
- Custom locale via `loadMessages`.
- Full RTL.

### Mobile / touch
- Adaptive UI (`columnHidingEnabled`) — auto-hides columns to fit screen.
- Touch interactions: tap, long-tap, swipe.
- Pull-to-refresh patterns.

### Other notable features
- **Column Chooser** (built-in popup or always-visible panel).
- **Column reorder, resize, fix (left/right pin)**.
- **Frozen rows** (header / footer area).
- **Multi-row headers** (`columnGroups`).
- **Focused Row** — designate currently focused row across navigation; events `onFocusedRowChanging/Changed`, `onFocusedCellChanging/Changed`.
- **State Persistence** — save/restore via localStorage or custom (sort/filter/group/columns/paging/selection).
- **Adaptive layout**.
- **Column Hiding Priority**.
- **Editing with cascading dropdowns**.
- **Master Filter Row + Search Panel + Header Filter** simultaneously.
- **Validation summary**.
- **Toolbar customization**.
- **Print to PDF / browser**.
- **Conditional formatting** via cellPrepared.
- **Drag-drop rows** within and across grids.
- **Bands / column groups** (multi-level headers).
- **Stored procedure / OData / GraphQL** via CustomStore.

## API style
- Vanilla: `new DevExpress.ui.dxDataGrid(element, options)`.
- React: declarative `<DataGrid dataSource={...} columns={...} sorting={...} editing={...}>` with sub-components like `<Sorting>`, `<FilterRow>`, `<HeaderFilter>`, `<Editing>`, `<Selection>`, `<Scrolling mode="virtual" />`, etc.
- Imperative ref API (`grid.refresh()`, `grid.expandAll()`).
- Events: `onCellPrepared`, `onRowPrepared`, `onContentReady`, dozens more.

## Bundle size (if disclosed)
- DevExtreme is a large suite. DataGrid bundle alone is ~300–500 KB min+gz including its DataSource/Store layer.
- Tree-shaking via `import 'devextreme/ui/data_grid'` style.
- Theme CSS adds 50–150 KB.

## Performance claims (with sources)
- Virtual + infinite scroll handles "hundreds of thousands of records."
- PivotGrid client engine processes up to **1,000,000 records** in browser.
- "Designed for high-performance enterprise applications."
- Real-world deployments include large financial/ERP systems.

## Notable weaknesses or gotchas
- Bundle size — `devextreme` is large; Internet Explorer-era heritage and breadth of features.
- API surface is enormous; API reference is dense.
- License-key required at runtime — missing key shows a banner ("Trial mode").
- Renewals required to access new versions.
- Per-developer license must be enforced; OEM/SaaS terms via sales.
- jQuery dependency historically present (now optional in modern bundles).
- Some users find Material theme's default sizing too tall; tuning needed.
- TypeScript typings exist but generic; not as ergonomic as Mantine/Chakra-grade libraries.
- Migrating between major versions occasionally requires non-trivial code updates (config schema changes).

## Source URLs read
- https://js.devexpress.com/Documentation/Guide/UI_Components/DataGrid/
- https://js.devexpress.com/jQuery/Documentation/Guide/UI_Components/DataGrid/Overview/
- https://js.devexpress.com/React/Documentation/Guide/UI_Components/DataGrid/Overview/
- https://js.devexpress.com/React/Documentation/Guide/UI_Components/DataGrid/Focused_Row/
- https://js.devexpress.com/overview/pivotgrid/
- https://js.devexpress.com/Buy/
- https://js.devexpress.com/Licensing/
- https://www.componentsource.com/product/devextreme-complete/prices
