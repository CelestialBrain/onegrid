# Kendo UI Grid (Telerik / Progress)

**Source**: https://www.telerik.com/kendo-react-ui/components/grid/
**Repo**: https://github.com/telerik/kendo-react (KendoReact source partially open; core controls closed).
**License**: Commercial, **per-developer**. Annual subscription **or** perpetual one-time purchase.
**Pricing** (per telerik.com/kendo-react-ui/pricing & ComponentSource, 2026 Q1):
- **KendoReact** — **$881.02–$930.02 per developer license** (varies by reseller and bundle).
- One license per developer; perpetual purchase includes 1 yr updates/support, then renewal optional.
- Annual subscription license alternative (renewable, includes ongoing support/updates).
- Volume discounts: **5% off (2–5 devs), 10% off (6+ devs)**.
- KendoReact is part of **Kendo UI** (which covers jQuery, Angular, Vue, React) — bundle pricing for full suite is higher.
- Free **30-day trial**. No free tier.
**Latest version**: KendoReact 2026.1.x (Q1 2026 — Telerik ships 3 release waves per year: R1/R2/R3).
**Maintenance**: Very active.

## Architecture
Native React component (KendoReact). Pure React rendering, no jQuery, no virtual DOM tricks. Row and column virtualization built in; "renders only the visible data". Server-side data via state-driven API (developer manages data; grid renders prop-driven). No internal data store — controlled / uncontrolled patterns.

## Framework support
- **React** — KendoReact (native; reviewed product here).
- **Angular** — Kendo UI for Angular (native).
- **Vue 2/3** — Kendo UI for Vue (native + wrappers).
- **jQuery** — Kendo UI for jQuery (legacy, still maintained).
- All ship as separate packages; APIs differ; same brand and roughly comparable feature sets.

## Features

### Sorting
- Single and multi-column.
- `sortable` prop with `mode: 'single' | 'multiple'`.
- Custom comparators via parent state.
- Server-side sort: developer applies to data prop.

### Filtering
- **Filter Row** (column header inputs).
- **Filter Menu** (dropdown filter UI).
- **Excel-like Filter** (checklist + condition).
- Operators per data type.
- Custom filter cells / filter UI.

### Grouping
- Multi-level grouping.
- Group panel (drag column header).
- Group footer aggregates.
- Lazy load groups (load detail per group on expand).

### Pivoting
- Not in KendoReact Grid. Kendo UI for jQuery has a separate **PivotGrid** widget; KendoReact does not (as of 2026.1).

### Aggregations
- Group footer and overall footer aggregates.
- Built-in: sum, average, count, min, max.
- Custom aggregate functions.

### Editing
- **In-cell edit** (click to edit single cell).
- **Inline edit** (whole row in edit mode).
- **Popup/dialog edit**.
- Edit cell types: input, dropdown, datepicker, numeric, custom.
- Validation via React Hook Form / formik / Kendo Form integration.
- Add/remove row via toolbar.

### Selection
- Single, multiple-row, cell-range, checkbox column.
- Drag selection.
- Keyboard-extended selection.

### Clipboard / copy-paste
- Copy (Ctrl+C) supported.
- Paste behavior is documented; row-paste handler.
- Excel-style range copy.

### Virtualization
- **Row virtualization** (vertical scroll).
- **Column virtualization** (horizontal scroll).
- Both opt-in; combined for large datasets.

### Accessibility
- WCAG 2.1 AA target.
- WAI-ARIA grid pattern.
- Full keyboard nav (arrows, tab, Enter, Esc, F2).
- Screen-reader-tested.
- Reduced motion respected.

### Server-side row model / lazy loading
- Controlled component pattern: developer holds data state and applies sort/filter/group/page on the server then passes results in.
- No built-in client store. `process()` helper from `@progress/kendo-data-query` performs operations client-side.
- Pager + virtual scroll patterns for "virtual remote data".

### Streaming / live updates
- "Streaming and remote data support" (per docs).
- Push data through props; grid re-renders.
- No built-in WebSocket; user wires it.

### Formulas / computed cells
- No Excel formula engine. Computed via cell render functions.
- KendoReact has a separate **Spreadsheet** component (jQuery and Vue have it; React Spreadsheet is more limited).

### Theming
- Built-in themes: Default, Bootstrap, Material, Fluent.
- SASS source (`@progress/kendo-theme-default`).
- ThemeBuilder online tool.
- CSS variables for runtime theming.

### Export (CSV, Excel, PDF)
- **Excel Export** built-in (`@progress/kendo-react-excel-export`).
- **PDF Export** built-in (`@progress/kendo-react-pdf`).
- CSV not first-class but easy via Excel export.
- Style export, header/footer, multi-page, group export.

### Master / detail
- `detail` prop renders sub-component per row.
- Hierarchical: master grid + nested grid.

### Tree data
- **Separate TreeList component** (`@progress/kendo-react-treelist`) — mirrors Grid for hierarchical data; sort/filter/edit/page.

### Charts integration
- KendoReact Charts is a separate package; pairs naturally. Sparkline cells supported.

### i18n / RTL
- Internationalization via `IntlProvider` (CLDR-based).
- 30+ locales prebuilt.
- Full RTL.

### Mobile / touch
- Touch-aware. Reasonable on tablets; phones expected to use Drawer/list pattern.
- Responsive but not auto-collapsing columns.

### Other notable features
- **Column resize, reorder, freeze (locked columns)**.
- **Column menu** (sort, filter, lock, hide).
- **Column chooser**.
- **Column groups / multi-row headers**.
- **Frozen rows** (header + footer).
- **Row drag-drop**.
- **Cell template / custom cell render**.
- **Row template**.
- **Conditional formatting** via cellRender.
- **State management** via React state.
- **Search panel** (toolbar pattern).
- **Print** (CSS / pdf export).
- **Aggregates in column header**.
- **Prompt-controlled DataGrid** — recent AI-assist add-on (sort/filter from natural language).
- **RSC mode** (React Server Components).

## API style
React-idiomatic. Controlled component: `<Grid data={data} sortable filterable selectable onDataStateChange={...}>`. State held in user component; helpers from `@progress/kendo-data-query` apply ops. Children: `<GridColumn>` declarative. Imperative actions via refs minimal — most via state.

## Bundle size (if disclosed)
- Tree-shakable per-package. KendoReact Grid + dependencies typically ~150–250 KB min+gz.
- Theme CSS adds ~30–80 KB.
- Independent packages mean unused features stay out.

## Performance claims (with sources)
- "Render only the visible data" via virtualization.
- 100k row demo in samples.
- No published 1M+ benchmark; recommend server-side for very large.

## Notable weaknesses or gotchas
- Controlled-only model: developer must wire sort/filter/group/page state. More flexible but more boilerplate than fully managed grids.
- No client-side virtual scroll for grouped+filtered out-of-the-box on huge datasets — server-side recommended.
- Per-developer license; license key embedded in the bundle and validated. Free trial expires.
- Reseller pricing variance — actual cost depends on contract.
- Bundle is many small packages (`@progress/kendo-react-grid`, `…-data-query`, `…-pdf`, `…-excel-export`); install footprint multiplies.
- No PivotGrid in React (jQuery has it).
- Theme is opinionated; deep customization needs SCSS rebuild.

## Source URLs read
- https://www.telerik.com/kendo-react-ui/components/grid/
- https://www.telerik.com/kendo-react-ui/pricing
- https://www.telerik.com/kendo-react-ui/pricing/faq
- https://www.componentsource.com/product/kendoreact/prices
