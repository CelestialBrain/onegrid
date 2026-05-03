# AG Grid

**Source**: https://www.ag-grid.com/javascript-data-grid/
**Repo**: https://github.com/ag-grid/ag-grid
**License**: Dual — `ag-grid-community` MIT, `ag-grid-enterprise` commercial. Enterprise requires a license key at runtime; without one, watermark + console warnings appear.
**Pricing** (per developer, perpetual; one year of updates included):
- AG Grid Community — Free (MIT)
- AG Grid Enterprise — $999 USD / dev
- AG Grid + AG Charts Enterprise Bundle — $1,498 USD / dev
- 30-day full-feature trial; no watermark during trial
**Latest version**: 35.2.1 (released 2026-04-07, per GitHub release listing)
**Stars**: ~15.3k
**Maintenance**: Active. Multi-team commercial product. Frequent minor + patch releases.

## Architecture
- DOM-based virtualized rendering. Each visible row + column produces real DOM nodes; off-viewport rows/cols are recycled.
- Internal imperative state machine; grid owns the truth, app talks to it via `gridApi`.
- Modular core: separate row models, separate filter modules, separate export modules. The bundle is built from `ModuleRegistry.registerModules([...])`.
- Framework adapters wrap the core in `ag-grid-react`, `ag-grid-vue3`, `ag-grid-angular`. Each is thin — passes columnDefs / props through and wires up framework component lookup.
- Reactivity model: imperative diff. App passes `rowData` (array reference) or calls `applyTransaction({ add, remove, update })`. Refs trigger re-render; transactions trigger surgical diffs.
- "ReactUI" mode (newer, default in v32+) renders cells as React components instead of DOM strings — better React integration, slight perf cost (see issue #4920).

## Framework support
- **Vanilla JS / TS** — first-class. Core package is `ag-grid-community` / `ag-grid-enterprise`.
- **React** — `ag-grid-react`, supports React 16.8+ (hooks). React 18 + 19 supported in v32+.
- **Vue 3** — `ag-grid-vue3`. Vue 2 wrapper EOL.
- **Angular** — `ag-grid-angular`, current Angular 17+ supported in v34+.
- **Svelte / Solid / Qwik** — no first-party wrapper; vanilla core works with any framework via DOM mounting.

## Features

### Sorting
- Single-column and multi-column sort (Shift-click for multi).
- Custom comparator per column (`comparator: (a, b, nodeA, nodeB, isDescending) => number`).
- Server-side sort delegation in SSRM via `sortModel` in `IServerSideGetRowsParams`.
- Default unsorted state plumbed through with `unSortIcon: true`.
- Accent-/locale-aware string sort.

### Filtering
- **Community filters**: text, number, date, BigInt (v32+).
- **Enterprise filters**: Set Filter (Excel-like value list), Multi Filter (combine text + set), Advanced Filter (formula-style boolean expression UI), Quick Filter (cross-column free text).
- Floating filters (in the column header).
- Filter Tool Panel (sidebar listing all column filters).
- Custom filter components (`ICellEditorComp`-style contract).
- Server-side filter delegation: filterModel JSON sent to backend.

### Grouping
- Row Grouping by drag-to-grouping-area or `colDef.rowGroup: true`.
- Group display types: `singleColumn`, `multipleColumns`, `groupRows`, `custom`.
- `groupHideOpenParents`, `groupTotalRow: 'top' | 'bottom'`, `groupAllowUnbalanced`.
- Server-side grouping in SSRM (`rowGroupCols` sent to server).

### Pivoting
- Pivot mode toggle (`pivotMode: true`).
- Pivot rows / columns / values via colDef flags (`pivot`, `rowGroup`, `aggFunc`).
- Pivot Result Columns auto-generated; secondary column groups.
- Pivot totals rows + cols.
- Server-side pivot delegation.

### Aggregations
- Built-in: `sum`, `min`, `max`, `count`, `avg`, `first`, `last`.
- Custom agg funcs registered via `aggFuncs` map.
- Per-column `aggFunc`. Multi-aggregation in pivot mode.
- `aggFunc` receives `IAggFuncParams { values, rowNode, data, colDef }`.

### Editing
- **Cell editing** (default) — single cell editor pops up.
- **Full-row editing** (`editType: 'fullRow'`) — all editable cells in row enter edit mode together; commit together.
- Built-in editors: `agTextCellEditor`, `agNumberCellEditor`, `agDateCellEditor`, `agSelectCellEditor`, `agRichSelectCellEditor` (Enterprise), `agLargeTextCellEditor`, `agCheckboxCellEditor`.
- Custom editor: `ICellEditorComp { init, getGui, getValue, isPopup?, afterGuiAttached?, isCancelBeforeStart?, isCancelAfterEnd? }`.
- Editing triggers: Enter, F2, double-click, single-click (`singleClickEdit`), printable char, Backspace.
- Stop triggers: Enter, Escape, Tab, focus loss (`stopEditingWhenCellsLoseFocus`).
- Events: `cellEditingStarted`, `cellEditingStopped`, `cellValueChanged`, `rowValueChanged`.
- Validation: via `valueParser` + custom logic; no first-class validator API (compared to Handsontable).
- **Undo/redo** — Enterprise. `undoRedoCellEditing: true`. `api.undoCellEditing()`, `api.redoCellEditing()`.
- **Batch editing** via `api.applyTransaction({ add, remove, update })` — all rows updated in a single render.

### Selection
- **Row selection**: `single` or `multiple`. Checkbox selection via `colDef.checkboxSelection: true`. Header checkbox for select-all.
- **Cell range selection** (Enterprise) — Excel-like contiguous + non-contiguous (Ctrl+drag) ranges.
- **Fill handle** (Enterprise) — drag the corner of a range to fill, like Excel.
- **Range handle** (Enterprise) — programmatic.
- `rowMultiSelectWithClick`, `suppressRowDeselection`, `suppressCellFocus`.

### Clipboard / copy-paste
- Enterprise feature.
- Copy/paste single cells, ranges, full rows.
- `processCellForClipboard` / `processCellFromClipboard` callbacks.
- Headers included via `clipboardOptions: { copyHeadersToClipboard: true }`.
- Paste into selected range; paste from Excel/Google Sheets supported.

### Virtualization
- Row + column virtualization both built-in and on by default.
- DOM-based: visible rows/cols rendered as real elements; off-screen recycled.
- `suppressRowVirtualisation` / `suppressColumnVirtualisation` to disable (e.g. for testing or print).
- Buffer rows configured via `rowBuffer` (default 10).

### Accessibility
- WAI-ARIA grid pattern: `role="grid"` / `role="treegrid"`, `aria-rowcount`, `aria-colcount`, `aria-rowindex`, `aria-colindex`, `aria-selected`, `aria-expanded`, `aria-sort`.
- Full keyboard navigation (Tab, arrows, Enter, F2, Page Up/Down, Home/End, Ctrl+arrows).
- Tested with JAWS + VoiceOver. No formal certification cited.
- `ensureDomOrder: true` for screen-reader-correct DOM order (disables column-virt-reordering for AT users).
- RTL via `enableRtl: true`.
- Focusable headers, sortable header announces direction.

### Server-side row model (SSRM)
Enterprise. Two patterns: lazy-loading groups + infinite scroll.

`IServerSideDatasource` contract:
```ts
interface IServerSideDatasource {
  getRows(params: IServerSideGetRowsParams): void;
  destroy?(): void;
}

interface IServerSideGetRowsParams {
  request: IServerSideGetRowsRequest;
  successCallback(rows: any[], lastRowIndex?: number): void;
  failCallback(): void;
  api: GridApi;
  context: any;
  parentNode: IRowNode;
}

interface IServerSideGetRowsRequest {
  startRow?: number;
  endRow?: number;
  rowGroupCols: ColumnVO[];
  valueCols: ColumnVO[];
  pivotCols: ColumnVO[];
  pivotMode: boolean;
  groupKeys: string[];
  filterModel: any;
  sortModel: SortModelItem[];
}
```
- Block size (`cacheBlockSize`, default 100).
- `maxBlocksInCache` controls memory.
- `purgeClosedRowNodes`, `transactions` for live updates via `api.applyServerSideTransaction()`.
- Documented full-stack examples for Node/MySQL, Java/Oracle, GraphQL, Spark.

### Streaming / live updates
- `applyTransactionAsync({ add, remove, update })` — batches updates across animation frames.
- Delta updates: refs to row data don't need to change; transactions provide deltas.
- High-frequency demo: 100k+ updates/sec without dropping frames (per AG Grid blog).
- Flashing cells on change: `enableCellChangeFlash` per column.

### Formulas / computed cells
- No formula engine in the grid itself.
- Excel Export can convert valueGetters into Excel formulas (`processCellCallback` + `formula` field).
- Cells can reference computed values via `valueGetter: (params) => ...`. Not a true formula engine — no dependency graph, no Excel function library.

### Theming / customization / custom cell renderers
- v33+ uses Theming API (CSS variable based). Built-in themes: Quartz, Material, Alpine, Balham (deprecated).
- Custom cell renderer interface `ICellRendererComp { init(params), getGui(), refresh(params): boolean, destroy?() }`.
- `cellRendererSelector` for conditional renderers.
- Framework components register a name → component map and reference by string in colDef.
- Custom header components (`IHeaderComp`), custom tooltip components.
- `cellStyle` (object or function), `cellClass` (string or function), `cellClassRules` (rules map).

### Export
- **CSV** — Community. `api.exportDataAsCsv(params)`.
- **Excel (.xlsx)** — Enterprise. `api.exportDataAsExcel(params)`. Built-in, no third-party libs. Supports: cell styling, formulas (from valueGetters), images, multiple sheets, page setup, freeze panes, sheet protection, hyperlinks, data types preserved, master-detail export.
- **PDF** — not native; recommends third-party (jsPDF) over `getDataAsCsv`.

### Master / detail rows
- Enterprise. `masterDetail: true` + `agGroupCellRenderer`.
- `detailCellRendererParams.detailGridOptions` defines the detail grid.
- `getDetailRowData` callback populates detail.
- `detailRowHeight`, `detailRowAutoHeight`, `keepDetailRows`.
- `isRowMaster` per-row predicate.
- Master grid: Client-side or SSRM. Detail grid: any row model.
- Nested master/detail (detail grid can itself be a master).

### Tree data
- Enterprise. `treeData: true`.
- Three modes: path-based (`getDataPath: row => row.path`), nested-children (`treeDataChildrenField`), self-referencing (`treeDataParentIdField` v34+).
- Works with grouping, pivoting, SSRM.

### Charts integration
- Enterprise. Powered by AG Charts.
- Range Charts (chart from a cell range) + Pivot Charts (chart from pivot mode).
- Chart types: column, bar, line, area, scatter, bubble, pie, donut, histogram, combination, range bar/area, box plot, waterfall, heatmap, treemap, sunburst.
- Sparklines per cell via cell renderer.
- `chartToolPanelsDef` controls chart customizer.
- API: `api.createRangeChart()`, `api.createPivotChart()`, `api.getChartImageDataURL()`.

### Internationalization
- `localeText` map for all visible strings.
- Locale presets shipped (~25 languages).
- RTL via `enableRtl`.
- Date format via column type / `agDateColumnFilter`.

### Mobile / touch
- Touch events handled (long-press for context menu, pinch-zoom).
- Documented as "designed for desktop"; mobile is a second-class target. Touch UX has rough edges (e.g. fill handle on touch).

### Other notable features
- **Status bar** (Enterprise) — totals, selected count, average, custom panels.
- **Side bar** (Enterprise) — filters tool panel, columns tool panel.
- **Column menu** — header dropdown with sort/filter/pin/auto-size/group/pivot.
- **Context menu** (Enterprise) — right-click.
- **Column pinning** (left/right).
- **Row pinning** (top/bottom) — `pinnedTopRowData`, `pinnedBottomRowData`.
- **Row dragging** — drag-to-reorder rows; cross-grid drag.
- **Column auto-size** — fit-to-content (`api.autoSizeColumns()`).
- **Find** (v32+, Enterprise) — global text search across cells.
- **AI Toolkit** (v34+) — natural-language query → filter/sort.
- **Validation Module** — dev-only, warns on invalid configs.
- **No third-party dependencies** in core community package.

## API style
- **Imperative** — most operations go through `gridApi` (`api.applyTransaction()`, `api.setFilterModel()`, `api.startEditingCell()`).
- **Declarative** — column definitions and most options are passed via props/options on instantiation; many can be re-applied via `gridOptions` updates.
- TypeScript: first-class. All exports typed; column definitions parameterized over row data type (`ColDef<TData, TValue>`).
- Batteries-included: ships markup, default theme, all interactions.

## Bundle size
- `ag-grid-community` core: ~270 KB min+gzip (without theme CSS).
- `ag-grid-enterprise` adds ~280 KB+ on top depending on modules.
- Bundle inflated after v32 modularization (issue #3502 reports gzip got bigger).
- AG Charts adds another ~150-300 KB.
- Tree-shaking story exists via modules but is criticized — `AllEnterpriseModule` pulls everything.

## Performance claims
- "Outstanding performance" — README.
- Demos commonly show 100k–500k rows client-side, 10M+ rows via SSRM.
- High-frequency-update blog posts cite 100k updates/second.
- No formal benchmark suite published.

## Recurring weaknesses
1. **Bundle size** (issues [#1459](https://github.com/ag-grid/ag-grid/issues/1459), [#3502](https://github.com/ag-grid/ag-grid/issues/3502)). 540 KB+ minified historically; modularization didn't shrink as promised in some configs.
2. **Imperative API critique** — state lives inside the grid; users complain that React/Vue idioms (controlled components, "data is the source of truth") fight the grid. Issue [#2932](https://github.com/ag-grid/ag-grid/issues/2932) "The sad internal state of AG Grid".
3. **ReactUI cell renderer perf** ([#4920](https://github.com/ag-grid/ag-grid/issues/4920), [#12833](https://github.com/ag-grid/ag-grid/issues/12833)) — React mode noticeably slower than the legacy DOM mode for many cell renderers.
4. **Enterprise pricing + breaking changes**. $999/dev/year resistance; community frustrated by frequent breaking changes (theming overhauls v32, v33).
5. **Mobile/touch** — touch interactions for fill handle, range select, context menu are subpar.

## Source URLs read
- https://www.ag-grid.com/javascript-data-grid/
- https://www.ag-grid.com/license-pricing
- https://www.ag-grid.com/javascript-data-grid/server-side-model/
- https://www.ag-grid.com/javascript-data-grid/integrated-charts/
- https://www.ag-grid.com/javascript-data-grid/master-detail/
- https://www.ag-grid.com/javascript-data-grid/excel-export/
- https://www.ag-grid.com/javascript-data-grid/cell-editing-start-stop/
- https://www.ag-grid.com/javascript-data-grid/modules/
- https://www.ag-grid.com/javascript-data-grid/cell-rendering/
- https://www.ag-grid.com/javascript-data-grid/accessibility/
- https://github.com/ag-grid/ag-grid
- https://github.com/ag-grid/ag-grid/issues/1459
- https://github.com/ag-grid/ag-grid/issues/2932
- https://github.com/ag-grid/ag-grid/issues/3502
- https://github.com/ag-grid/ag-grid/issues/4920
- https://github.com/ag-grid/ag-grid/issues/12833
- https://www.thefrontendcompany.com/posts/ag-grid-alternatives
