# SlickGrid (mleibman + 6pac fork)

**Source**: https://github.com/6pac/SlickGrid (active), http://6pac.github.io/SlickGrid/ (demos)
**Repo**:
- Original: https://github.com/mleibman/SlickGrid (last commit ~2014, abandoned/legacy).
- Active fork: https://github.com/6pac/SlickGrid (the canonical 2026 source).
**License**: **MIT** (both forks).
**Pricing**: Free (MIT). No commercial tiers. Note: although MIT, included here per the brief because its feature set rivals commercial grids.
**Latest version**: 5.18.3 (March 2026 per release page; 5.x line modernized to TypeScript, ESM/IIFE builds, Alpine theme, jQueryUI removed in v3, jQuery optional since v4).
**Maintenance**:
- mleibman/SlickGrid — **abandoned** (no commits since 2014).
- 6pac/SlickGrid — **active**, the de-facto master. Maintained by Ghislain Beaulac (6pac) and contributors.

## Architecture
"Lightning fast JavaScript grid/spreadsheet" — DOM-rendered (despite folklore: SlickGrid is **NOT** canvas-based; it uses absolutely-positioned divs in a virtualized container — the "div-canvas" pattern). Aggressive **row + column virtualization** keeps DOM tiny (only viewport cells exist). Modular plugin architecture: core grid + opt-in plugins (DataView, GroupItemMetadataProvider, RowDetail, etc.). Single dependency: SortableJS.

## Framework support
- **Vanilla JS / TypeScript** — native and primary.
- **jQuery** — optional since v4.0.
- **Angular** — via [Angular-Slickgrid](https://github.com/ghiscoding/Angular-Slickgrid) wrapper (Ghislain's). Highly popular.
- **React** — via [SlickGrid-React](https://github.com/ghiscoding/slickgrid-react) wrapper.
- **Aurelia** — via Aurelia-Slickgrid wrapper.
- **Vue** — community wrapper.
- **Universal** wrapper: [Slickgrid-Universal](https://github.com/ghiscoding/slickgrid-universal) — shared core for the framework wrappers.

## Features

### Sorting
- Single and multi-column sort (click + Shift+click).
- **Tristate** sort (asc → desc → none).
- Custom sort comparators.
- DataView-driven sort for large data.
- Server-side sort via custom DataView.

### Filtering
- **Header row quick filters** (per-column input).
- DataView filter function (free-form predicate).
- Operator-based filters (text, number, date, etc.) via wrapper plugins.
- Combined sort + filter via DataView.

### Grouping
- **Interactive grouping with aggregates** (expand/collapse).
- **Draggable grouping** (drag column to group bar).
- **Header grouping** (multi-level column headers).
- Multi-level grouping.

### Pivoting
- Not built-in. Some plugins approximate via grouping + aggregates.

### Aggregations
- Built-in aggregators: `Avg`, `Min`, `Max`, `Sum`, `Count`. Pluggable.
- Group totals.
- Cross-row totals (custom).

### Editing
- Inline cell editing.
- Editor types: text, integer, float, date, checkbox, percent complete, long text, dropdown, custom.
- **Compound editors**.
- **CompositeEditor** — modal dialog edits multiple fields (create/edit/mass-update).
- Pre-click checkbox edit.
- Undo support.

### Selection
- Row selection, cell range selection, multi-select.
- **Hybrid SelectionModel** (row OR column selection in same grid).
- Checkbox selection plugin.
- Group-level select.

### Clipboard / copy-paste
- **CellExternalCopyManager** plugin: Excel-compatible copy/paste of cell ranges.
- Spreadsheet-mode demo with formulas + Excel-compatible paste.

### Virtualization
- Row + column virtualization always on.
- Virtual scroll demo with **500,000-row DataView**.
- High-frequency trading demo (live updates + virtualization).

### Accessibility
- WAI-ARIA support added in 5.x (improvement over 2014 original).
- Keyboard navigation: arrows, tab, F2, Enter, Escape.
- Screen reader support documented; not as polished as commercial grids — community feedback is mixed.

### Server-side row model / lazy loading
- **AJAX loader demo** for paged remote data.
- Plug your own DataView replacement for server-side.
- Slickgrid-Universal wrappers add a backend-services facade (OData, GraphQL).

### Streaming / live updates
- High-frequency trading demo: cell flash on update, throttled re-render.
- DataView `add/update/delete` triggers minimal-cost row updates.
- Designed for streaming workloads from day one.

### Formulas / computed cells
- **Spreadsheet mode** demo with cell formulas (HyperFormula or formulaParser plugin).
- Computed column via cell formatter / row metadata.

### Theming
- **Alpine theme** (modern, default in 5.x).
- Classic theme.
- SCSS source. CSS variables.
- Per-cell, per-row metadata for class names.

### Export (CSV, Excel, PDF)
- Built-in export depends on plugin / wrapper:
  - **ExcelExportService** (in Slickgrid-Universal / Angular-Slickgrid) — XLSX export with styling.
  - **TextExportService** — CSV / TSV.
  - **PDF**: not first-class; user-implemented via jsPDF or browser print.

### Master / detail
- **RowDetailView plugin** — expand row to show detail panel (custom HTML / sub-grid).
- "Master/Detail Grids" example (sub-grid bound to selected row).

### Tree data
- Tree mode via Slickgrid-Universal / wrappers (`TreeDataService`).
- Sort/filter on tree.
- Async node loading.

### Charts integration
- None built-in; bring your own (Chart.js, Highcharts).

### i18n / RTL
- i18n via wrapper (Angular-Slickgrid uses i18next/Angular i18n; React wrapper similar).
- RTL support added in modern fork (CSS-side).

### Mobile / touch
- Touch interactions added in fork. Replaced jQueryUI with SortableJS (touch-friendly).
- Reasonable on tablet; phones not the target.

### Other notable features
- **Frozen columns + frozen rows** (pinning) — merged from X-SlickGrid.
- **Column reorder, resize, header buttons, header menu, context menu, grid menu**.
- **Custom tooltips** plugin.
- **Cell range decorator**.
- **Cell external copy manager** (Excel paste).
- **Auto-tooltips**.
- **Row span / col span**.
- **Rowspan within data**.
- **Plugin ecosystem**: GridState, AutoColumnSize, DraggableGrouping, HeaderButtons, HeaderMenu, ContextMenu, GridMenu, CustomTooltip, RowDetail, CheckboxSelectColumn, CellMenu.
- **Web Components example**.
- **Shadow DOM compatible**.
- **Infinite scroll example**.
- **PubSub event system**.

## API style
Imperative + event-driven. `var grid = new Slick.Grid('#myGrid', dataView, columns, options);`. Plugins registered via `grid.registerPlugin()`. Events: `grid.onSort.subscribe(fn)`, `grid.onCellChange.subscribe(fn)`. Wrappers (Angular/React) provide declarative facades. Lower-level than commercial grids but extremely flexible.

## Bundle size (if disclosed)
- Core SlickGrid: ~80–120 KB min+gz.
- With common plugins (DataView, GroupItemMetadataProvider, basic editors): ~150 KB min+gz.
- Wrappers (Angular-Slickgrid) add ~50–100 KB.
- Single dependency (SortableJS) is small.

## Performance claims (with sources)
- "Lightning fast" — historical claim; founded the canvas-grid pattern (technically div-canvas).
- 500k-row DataView demo runs smoothly on stock hardware.
- High-frequency trading demo: stream updates with no scroll jank.
- Real-world deployments at multiple banks/trading platforms.

## Notable weaknesses or gotchas
- Original mleibman repo is **abandoned** since 2014 — do **not** use it; use 6pac fork.
- Lower-level API; more wiring than commercial grids.
- Documentation lives across wiki pages, code comments, and community wikis. Onboarding is steeper.
- Accessibility was historically weak; improved in fork but still trails commercial grids (Kendo, AG Grid Enterprise).
- No first-class TypeScript types until v5; types now shipped.
- Plugin compatibility: each major version (3 → 4 → 5) has had breaking changes; check plugin versions.
- jQuery-related friction: optional since v4 but legacy plugins may still expect it.
- Visualization beyond the grid (charts, pivots) absent — stack with other libs.

## Source URLs read
- https://github.com/6pac/SlickGrid
- https://github.com/6pac/SlickGrid/wiki
- https://github.com/6pac/SlickGrid/wiki/Examples
- https://github.com/6pac/SlickGrid/releases
- http://6pac.github.io/SlickGrid/
- https://github.com/mleibman/SlickGrid (legacy)
- https://www.npmjs.com/package/slickgrid-6pac
