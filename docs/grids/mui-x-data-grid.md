# MUI X DataGrid (Community + Pro + Premium)

**Source**: https://mui.com/x/react-data-grid/
**Repo**: https://github.com/mui/mui-x
**License**:
- `@mui/x-data-grid` (Community) — **MIT**
- `@mui/x-data-grid-pro` — **MUI X Commercial Pro license** (proprietary)
- `@mui/x-data-grid-premium` — **MUI X Commercial Premium license** (proprietary)
**Pricing** (per developer / per year, as of 2026):
- **Community**: free, MIT
- **Pro**: $299 / dev / year
- **Premium**: $599 / dev / year
- **Enterprise**: $1,399 / dev / year (15-seat minimum; adds priority support, CSM, etc.)
- All paid plans include perpetual production-use rights with one year of updates.
**Latest version**: 9.0.4 (2026)
**Stars**: ~4.7k on `mui/mui-x` (covers DataGrid plus other X components like DatePickers, Charts, TreeView)
**Maintenance**: Highly active. Backed by MUI Inc. with a dedicated commercial team. Frequent minor releases, public roadmap.

## Architecture

React-only. Built as a composable React component tree using hooks, internal state stores, and an `apiRef` imperative handle for escape-hatch programmatic access. Tightly integrated with Material UI for theming and styling (relies on the MUI System / `sx` prop).

Rendering is **virtualized by default** for both rows and columns:

- Row virtualization: only visible rows + a configurable `rowBufferPx` are mounted. Disabled when `autoHeight` is on.
- Column virtualization: columns under 150px from the viewport edge render outside; configurable via `columnBufferPx`.
- An experimental `virtualizerLayoutMode: 'controlled'` mode uses absolute positioning to eliminate white-space gaps during fast scrolls.
- Hard browser limits: scroll-container height capped at 17.5M px in Firefox, 33.5M px in Chromium/Safari — practical hard ceiling on row count without windowed/server-side strategies.

State is internal but observable; the grid exposes controlled prop pairs (`sortModel` / `onSortModelChange`, `filterModel` / `onFilterModelChange`, `paginationModel` / `onPaginationModelChange`, etc.) and an `apiRef` whose methods (`setRows`, `setColumnVisibilityModel`, `setEditCellValue`, `getExpandedDetailPanels`, ...) are the imperative side of the same store.

Reactivity: standard React. `rows` and `columns` are pure props; mutations require new array references. For large datasets, server-side data source mode bypasses the in-memory model.

## Framework support

- **React**: native (only first-party target). Requires React 17+.
- Vue, Angular, Svelte, Solid, vanilla — **not supported**. There are no first-party wrappers and the architecture (React hooks + context + MUI System) makes wrapping impractical.

## Features (be EXHAUSTIVE)

Tier legend below: **C** = Community (MIT), **Pro**, **Premium**.

### Sorting
- **C**: Single and multi-column sort, custom comparators, server-side mode (`sortingMode: 'server'`).

### Filtering
- **C**: Header filters, quick filter, filter operators per column type (string, number, date, boolean, single-select), `GridFilterModel`, server-side mode.
- **Pro**: Header filtering as a row, expanded operator set, multi-condition combinator UI.

### Grouping
- **C**: Column grouping (visual header groups), but **not** row grouping.
- **Premium**: Row grouping with arbitrary group-by fields, group footer rows, expand/collapse.

### Pivoting
- **Premium only**: Drag-and-drop pivot panel (Rows / Columns / Values). Toggle pivot mode via toolbar. Auto year/quarter columns for date fields. `getPivotDerivedColumns` for custom derivation. Per-column `pivotable: false`. Limitation: cannot use the same field multiple times in a pivot model.

### Aggregations
- **Premium only**: Built-in functions `sum`, `avg`, `min`, `max`, `size`, `size(true)`, `size(false)`. Custom aggregators via `GridAggregationFunction`. Footer-row or inline-with-grouping rendering. Integrates with filters (all rows vs. filtered) and pinned rows.

### Editing
- **C**: Cell edit, row edit, edit on click / on double-click, full edit lifecycle (`processRowUpdate`, validators, preProcessEditCellProps), undo/redo.
- **Pro**: Same; better with server-side mode.

### Selection
- **C**: Single and multi-row selection with checkbox column, programmatic selection, `rowSelectionModel`.
- **Pro**: Cell selection, range selection (Excel-style), multi-range.

### Clipboard / copy-paste
- **C**: Copy. Paste support is limited.
- **Pro**: Full copy/paste including multi-range paste, clipboard text-format conversion.

### Virtualization
- **C**: Disabled in Community (capped at 100 rows for row virtualization in some configurations). The free DataGrid is intentionally limited to discourage use as a free Pro replacement. Practically: keep Community datasets small (a few thousand rows max).
- **Pro / Premium**: Full row + column virtualization, controlled-layout mode, `rowBufferPx` / `columnBufferPx` tuning.

### Accessibility
- **C+**: WAI-ARIA roles, keyboard navigation, screen reader support, localization. Active accessibility focus from the MUI team.

### Server-side row model / lazy loading
- **Pro / Premium**: First-class **Data Source** abstraction. Implement `getRows()` returning paged/filtered/sorted rows; the grid auto-flips to `sortingMode/filterMode/paginationMode = 'server'`. Built-in 5-minute TTL in-memory cache (`GridDataSourceCacheDefault`); customizable or disable-able. Lazy-loading and infinite scrolling supported on top.

### Streaming / live updates
- **C+**: Update via prop change or `apiRef.current.updateRows([...])` for incremental updates without replacing the row array. No first-party pub/sub. Known performance ceiling around ~10 updates/sec at scale (issue #10952).

### Formulas / computed cells
- **C**: Computed columns via `valueGetter` / `valueFormatter`. No spreadsheet-style formula language.

### Theming / custom cell renderers
- **C+**: Full theming through MUI System (`theme.components.MuiDataGrid`, `sx`). Custom `renderCell`, `renderEditCell`, `renderHeader`, `renderFooter`, `renderDetailPanel`. Slots API for replacing toolbar, footer, no-rows overlay, etc.

### Export
- **C**: CSV export, print export.
- **Premium**: Excel (`.xlsx`) export with styling, merged cells, and grouped headers.

### Master / detail
- **Pro / Premium**: `getDetailPanelContent` returns custom React content per row. Auto or fixed height. `detailPanelExpandedRowIds` controlled state. `apiRef` methods: `getExpandedDetailPanels`, `setExpandedDetailPanels`, `toggleDetailPanel`. Lazy detail rendering supported. Known performance issue at high row counts (issue #7811).

### Tree data
- **Pro / Premium**: True parent-child tree data via `getTreeDataPath`. Expand/collapse, group depth, tree-aware filtering and sorting.

### Charts integration
- **Premium**: AI Assistant can ask MUI X Charts to render visualizations from the grid data. Otherwise, no inline chart cells; pair manually with `@mui/x-charts`.

### i18n / RTL
- **C+**: Localization with bundled language packs. RTL via MUI's RTL theme support.

### Mobile / touch
- **C+**: Touch scrolling and selection. **List view mode** (Pro) for narrow viewports.

### Other notable features
- **AI Assistant** (**Premium only**): Natural-language → grid view. Prompts like "sort by name" or "show amounts > 1000" call `setSortModel` / `setFilterModel`. Voice input on supported browsers. Two backends: MUI's hosted service (requires API key + proxy server you build) or your own AI provider via `onPrompt()` callback. Conversation persistence via `conversationId`. Privacy: `privateMode: true` limits logging; `metadata.referenceId` for per-user billing tracking. Customization: `examples` per column, `allowAiAssistantDataSampling`, `additionalContext`.
- Column reordering, pinning, hiding, resizing.
- Row reordering (Pro+).
- Header filters as a row (Pro+).
- Density options.
- Toolbar with quick filter, density, columns, export.

## API style

Declarative React with extensive controlled-prop pairs and a parallel imperative `apiRef`. TypeScript: first-class, all props and the `apiRef` are richly typed. Batteries-included — not headless. Styling assumes Material UI is already in the app; mixing with non-MUI design systems is possible but means you fight the theme.

## Bundle size

Per bundlephobia / npm (varies by version):
- `@mui/x-data-grid` (Community): ~110–130 kB min+gzip
- `@mui/x-data-grid-pro`: ~150–180 kB min+gzip
- `@mui/x-data-grid-premium`: ~200–240 kB min+gzip

Plus `@mui/material`, `@emotion/react`, `@emotion/styled` peer dependencies (another ~80–100 kB gzip combined). Tree-shakeable but the DataGrid itself is one big chunk — you don't pay only for the features you use.

## Performance claims (with sources)

- Pro/Premium demo: "100,000 rows × 31+ columns (3M+ cells)" handled smoothly (https://mui.com/x/react-data-grid/).
- Performance docs page: https://mui.com/x/react-data-grid/performance/ — recommends `getRowId`, memoizing `columns`, avoiding re-creation of objects, server-side mode for >100k rows.
- Browser ceiling notes: scroll container max 17.5M px (Firefox) / 33.5M px (Chromium/Safari).

## Recurring weaknesses (GitHub issues, Reddit)

- **High update rate** degrades quickly. Issue #10952 — at ~10 updates/sec the grid becomes nearly unusable, vs. plain HTML tables that handle 100/sec. Trading rows.
- **Master/Detail at scale** — `getDetailPanelContent` fires for every row on every re-render (#7811). Painful for >1k rows.
- **Editing/re-rendering lag** in `DataGridPro` reported (#3916) — noticeable with custom cell renderers.
- **Selection / scroll lag** with custom-rendered cells past a few hundred rows (#9492).
- **Column visibility toggles** slow with many columns (#15296).
- **Column resize / container resize** triggers expensive layout (#799).
- **Container width / scroll lag** on very large viewports (#14876).
- **Bundle size** — even Community is heavier than Tabulator or Grid.js for similar feature sets, because of MUI System/Emotion overhead.
- **React lock-in** — fundamentally not portable; teams in Vue/Svelte/Solid have to look elsewhere.
- **Pricing model** — per-developer pricing scales with team size, becomes meaningful at 10+ devs. Premium tier required for the genuinely hard features (pivot, aggregation, Excel export, AI Assistant).

## Source URLs read

- https://mui.com/x/react-data-grid/
- https://mui.com/x/react-data-grid/getting-started/
- https://mui.com/x/react-data-grid/server-side-data/
- https://mui.com/x/react-data-grid/aggregation/
- https://mui.com/x/react-data-grid/pivoting/
- https://mui.com/x/react-data-grid/master-detail/
- https://mui.com/x/react-data-grid/virtualization/
- https://mui.com/x/react-data-grid/ai-assistant/
- https://mui.com/pricing/
- https://github.com/mui/mui-x/issues/10952
- https://github.com/mui/mui-x/issues/8581
- https://github.com/mui/mui-x/issues/3916
- https://github.com/mui/mui-x/issues/7811
- https://github.com/mui/mui-x/issues/9492
- https://github.com/mui/mui-x/issues/14876
- https://github.com/mui/mui-x/issues/15296
- https://github.com/mui/mui-x/issues/799
