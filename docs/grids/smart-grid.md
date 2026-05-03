# Smart Grid / jqxGrid (jQWidgets / Smart UI)

**Source**:
- https://www.htmlelements.com/docs/grid/ (Smart UI — Web Components)
- https://www.jqwidgets.com/ (jQWidgets — jQuery + framework wrappers)
**Repo**: https://github.com/jqwidgets/jQWidgets (binaries; not full source).
**License**: Commercial. Smart UI is the modern Web-Components evolution of jqxGrid; both are sold by jqwidgets/Smart UI.
**Pricing** (per jqwidgets.com/license/ + componentsource.com, 2026):
- **jQWidgets standard list price** — historically starting around **$489–$995/dev** (one-off Developer License); reseller pricing on ComponentSource starts ~$489.02 (March 2026 snapshot).
- **Developer License** — per developer; includes source code, Premium Support (1 yr, 40 incidents, 24h response).
- **Team License (Site License)** — unlimited developers within a single legal entity, Platinum Support (unlimited incidents).
- **Enterprise License** — site + redistribution.
- **Smart UI single Component License** — **$199** for one component (e.g., just the Grid / just Charts). Innovative low-cost entry.
- Royalty-free deployment.
- 1 year of updates included; renewal required for new versions.
**Latest version**: Smart UI 21.x (rolling 2025–2026). jqxGrid (legacy classic build) still maintained as v18.x.
**Maintenance**: Active. jqWidgets has been developed since 2011; Smart UI is the modern (Web Components) line.

## Architecture
Two product lines from the same vendor:
- **jqxGrid (jQWidgets classic)** — jQuery-based widget; long history; DOM-rendered with row virtualization.
- **Smart UI Grid (`smart-grid`)** — modern **Web Component** (custom element). Framework-agnostic by design; renders to its own shadow DOM. Virtualized rendering; designed against 2026 web standards.
Smart UI is the recommended modern path; jqxGrid is the legacy.

## Framework support
- **Vanilla / Web Components** — native (`smart-webcomponents` package).
- **React** — wrapper (`smart-webcomponents-react`).
- **Angular** — wrapper (`smart-webcomponents-angular`).
- **Vue 2/3** — supported via Web Components directly.
- **jQuery** — jqxGrid (legacy line).
- **Blazor** — supported.

## Features

### Sorting
- Single and multi-column.
- `sorting: { enabled: true }` config.
- Server-side sort.
- Custom comparator.

### Filtering
- Filter Row, Filter Menu, **Excel-style filter** (checklist + condition).
- Operators per data type.
- Custom filter UI.
- Header dropdown filters.

### Grouping
- Multi-level grouping (drag-to-group panel).
- Group footer with aggregates.
- Expand/collapse with state.

### Pivoting
- Smart UI ships a **separate PivotTable component** for true pivot scenarios.

### Aggregations
- Footer aggregates: sum, count, avg, min, max, custom.
- Group aggregates.
- "Totals: enabled" config.

### Editing
- Edit modes: cell, row, form (popup).
- Editor types: text, numeric, date, dropdown, combobox, checkbox, custom template.
- Validation framework.
- Batch edit (Excel-like) and undo/redo.
- Add / delete rows.

### Selection
- Cell, row, column, multi-select, **extended selection** mode.
- Checkbox column.
- Drag-select range.

### Clipboard / copy-paste
- Copy/paste (Ctrl+C, Ctrl+V).
- Excel-style range paste.

### Virtualization
- Row and column virtualization.
- Demonstrated with hundreds of thousands of rows in their demos.

### Accessibility
- **WAI-ARIA**, **Section 508**, WCAG 2.1.
- Full keyboard navigation.
- Screen reader support.

### Server-side row model / lazy loading
- DataAdapter local + remote (REST, OData).
- "Bind to Web API" supported.
- Server-side sort/filter/page/group.
- Lazy load on demand.

### Streaming / live updates
- DataAdapter event-driven; manual refresh on change.
- WebSocket integration via custom data source.

### Formulas / computed cells
- Computed columns via expressions/callbacks.
- Smart UI has a separate **Spreadsheet** component with full formulas.

### Theming
- Themes: Default, Bootstrap, Fluent, Material, plus dark variants.
- **CSS variables** for runtime customization.
- **Theme Builder** tool.

### Export (CSV, Excel, PDF)
- Export to **CSV, Excel (XLSX), PDF, JSON, XML, HTML, TSV**.
- "Export selected records" supported.
- Server-less in-browser.

### Master / detail
- Row detail / sub-row template.
- Nested grid pattern.

### Tree data
- Tree Grid mode (hierarchical, expand/collapse, async load).

### Charts integration
- Smart UI Chart component pairs naturally; sparkline column supported.

### i18n / RTL
- Localization for 20+ languages.
- Full RTL.

### Mobile / touch
- Touch events first-class. Tap, long-press, swipe.
- Adaptive on small screens.

### Other notable features
- **Frozen columns and rows** (left/right pinning).
- **Column reorder, resize, freeze, group, hide/show**.
- **Stacked / grouped headers**.
- **Conditional formatting**.
- **Cell tooltips, custom cell renderers**.
- **Drag-drop rows**.
- **State save/restore**.
- **Filter Builder** for complex predicates.
- **Column chooser** built-in.
- **Toolbar customization**.
- **Search panel**.
- **Cell templates** with HTML.
- **Print** view.
- **Smart UI as Web Components** — works in any framework natively.

## API style
- Smart UI: declarative attributes on `<smart-grid>` web component, plus JS config. React wrapper passes props; under the hood sets element properties.
- jqxGrid: jQuery widget pattern `$(selector).jqxGrid({ ... })`.
- Imperative methods on element/instance.

## Bundle size (if disclosed)
- Smart UI Grid component-only build is competitive; vendor advertises modular delivery.
- Typical Grid-only bundle ~150–250 KB min+gz.
- Web Components avoid per-framework runtime overhead.

## Performance claims (with sources)
- Vendor claims handling of "very large datasets" via virtualization.
- 100k+ row demos.
- "60+ enterprise-ready UI components and 30+ advanced chart types" in suite.
- No published 1M-row benchmark.

## Notable weaknesses or gotchas
- Two product lines (jqxGrid vs Smart UI) can confuse buyers; jqxGrid is jQuery-era, Smart UI is the future.
- Web Component shadow DOM can complicate styling overrides if you don't use CSS variables.
- License model has shifted; older buyers grandfathered. Check current terms.
- Per-component license ($199) is great for narrow use; full-suite cost rises quickly.
- Documentation density varies; some advanced topics buried.
- Brand fragmentation (htmlelements.com vs jqwidgets.com) makes navigation confusing.
- jQuery dependency lingers in classic jqxGrid; Smart UI is jQuery-free.

## Source URLs read
- https://www.htmlelements.com/docs/grid/
- https://www.jqwidgets.com/license/
- https://www.htmlelements.com/new-component-license/
- https://www.componentsource.com/product/jqwidgets/prices
- https://github.com/jqwidgets/jQWidgets
