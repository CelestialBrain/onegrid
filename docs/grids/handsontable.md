# Handsontable

**Source**: https://handsontable.com/docs
**Repo**: https://github.com/handsontable/handsontable
**License**: Dual-license. **Free for non-commercial / evaluation** under a custom non-commercial license (key: `'non-commercial-and-evaluation'`). **Commercial license** required for any commercial use. Note: not OSI-approved; not MIT.
**Pricing** (per developer; subscription, not perpetual):
- Hobby — Free, non-commercial only
- Standard — from $999/yr/dev (full features, email/forum support, 12 months of updates, 2 hr/mo code review)
- Priority — from $1,299/yr/dev (Zoom calls, 5 support tickets/mo, 5 hr/yr code review)
- Enterprise — Custom (unlimited support, dedicated Slack, phone, 24-month version support)
- 45-day no-CC trial.
**Latest version**: 17.0.1 (2026-03-25 per GitHub releases).
**Stars**: ~21.9k
**Maintenance**: Active. Backed by Handsoncode (commercial vendor). Frequent releases.

## Architecture
- DOM-based rendered virtual table. Visible cells are real `<td>` elements; off-screen cells are recycled by the WalkonTable virtualization engine that powers it.
- Single-table architecture (one `<table>` skeleton with absolutely positioned overlays for frozen rows/cols).
- Internal imperative state machine; the `Handsontable` instance owns the truth.
- Plugin-based: most features (filters, formulas, comments, contextMenu, mergeCells, etc.) are plugins that hook lifecycle events.
- Reactivity: imperative. `hot.loadData()`, `hot.setDataAtCell()`, `hot.updateData()`, `hot.batch(() => { ... })` for batched updates.

## Framework support
- **Vanilla JS / TS** — first-class.
- **React** — `@handsontable/react-wrapper` (functional/Hooks; v15+) and the legacy `@handsontable/react`. React 18+.
- **Angular** — `@handsontable/angular-wrapper` (Angular 17+) and legacy `@handsontable/angular`.
- **Vue 3** — `@handsontable/vue3`.
- **SSR** — Next.js, Astro, Remix, Nuxt all supported with documented setup (client-only mount).
- **Svelte / Solid / Qwik** — no first-party wrapper.

## Features

### Sorting
- Single-column (`columnSorting` plugin) and multi-column (`multiColumnSorting`).
- Indicator arrows in headers.
- Custom comparator per column (`compareFunctionFactory`).
- Sort by header click + initial sort config.

### Filtering
- `filters` plugin. Excel-style condition list per column (contains, begins with, equals, between, by value, custom).
- UI: dropdown menu in column header (`dropdownMenu` plugin).
- Programmatic: `hot.getPlugin('filters').addCondition(col, 'contains', ['foo'])`.

### Grouping
- **Column grouping** via `nestedHeaders` (multi-level header).
- **Row grouping** via `nestedRows` plugin (parent-child).
- Not full SSRM-style aggregation pipeline.

### Pivoting
- **Not built-in.** Has `columnSummary` plugin for sum/min/max/avg/count totals per column, but not pivot.

### Aggregations
- `columnSummary` plugin: `sum`, `min`, `max`, `count`, `average`, `custom`.
- Per-column or per-range. Multiple summary rows.

### Editing
- Per-cell `editor` (text, numeric, date, time, dropdown, autocomplete, checkbox, password, select, multiselect, handsontable [grid-in-grid]).
- Custom editors via `BaseEditor` class extension.
- Validators (`validator` per cell/column) — sync or async; `allowInvalid` flag.
- `beforeChange` / `afterChange` hooks; can mutate or reject.
- Read-only cells (`readOnly`).
- Disabled visual states.

### Selection
- **Cell selection**: single cell, ranges, multiple ranges (Ctrl+click).
- **Row / column selection** via headers.
- `selectionMode: 'single' | 'range' | 'multiple'`.
- `maxSelections`, `disableVisualSelection`.
- API: `hot.selectCell()`, `hot.selectRows()`, `hot.selectColumns()`, `hot.getSelectedRange()`.

### Clipboard / copy-paste
- `copyPaste` plugin built-in.
- Copy-as-TSV (Excel-compatible) and HTML.
- Paste from Excel/Google Sheets supported.
- `pasteMode: 'overwrite' | 'shift_down' | 'shift_right'`.
- Hooks: `beforeCopy`, `beforePaste`, `beforeCut`.
- Programmatic: `hot.getPlugin('copyPaste').copy()`, `.cut()`, `.paste()`.

### Virtualization
- Row + column virtualization built-in. Configurable buffers (`viewportRowRenderingOffset`, `viewportColumnRenderingOffset`).
- DOM recycling.

### Accessibility
- WAI-ARIA grid pattern (added/improved in v14).
- Full keyboard navigation; configurable shortcuts (`ShortcutManager`).
- Screen reader tested with NVDA, JAWS, VoiceOver.
- IME support for CJK input.
- High-contrast theme.
- RTL via `layoutDirection: 'rtl'`.

### Server-side row model
- **Not in the AG Grid sense.** Handsontable assumes data is loaded client-side.
- For large datasets the pattern is to wire your own paging on top via `loadData` / `updateData` and the `pagination` plugin.

### Streaming / live updates
- `hot.batch(() => { ... })` to coalesce multiple `setDataAtCell` calls into one render.
- `hot.suspendRender()` / `hot.resumeRender()` for manual control.
- Frequent updates: documented but not at AG Grid's "100k/sec" scale.

### Formulas / computed cells
- **Powered by HyperFormula** (separate file). `formulas` plugin: `formulas: { engine: HyperFormula }`.
- ~400 Excel-compatible functions, cross-sheet references, dependency graph.
- Cells: `=SUM(A1:A10)`, `=VLOOKUP(...)`, named expressions.
- See `hyperformula.md` for full engine details.

### Theming / customization / custom cell renderers
- Theme system overhauled in v14/15: `themeName` + design-system tokens.
- Built-in themes: Main, Horizon, plus light/dark variants.
- Custom CSS variables for colors, spacing, fonts, icons.
- Custom renderers: `renderer: (instance, td, row, col, prop, value, cellProperties) => void`.
- Custom editors: extend `BaseEditor`.
- Conditional formatting via `cells: (row, col) => ({ className, renderer, ... })`.
- Custom borders (`customBorders` plugin).

### Export
- **CSV export** built-in (`exportFile` plugin) — `hot.getPlugin('exportFile').downloadFile('csv', { ... })`.
- **No native Excel/PDF export** — recommended pairing with SheetJS or third-party.

### Master / detail rows
- **Not built-in.** `nestedRows` provides parent-child but not a separate detail grid.
- Workaround: render an embedded Handsontable inside a row (with `handsontable` cell type).

### Tree data
- `nestedRows` plugin — parent/child rows, expandable.
- Limited compared to AG Grid tree (no path mode, no SSRM tree).

### Charts integration
- Not built-in.

### Internationalization
- 17+ language packs (`en-US`, `de-DE`, `pl-PL`, `ja-JP`, `zh-CN`, etc.).
- `locale` config for sort/format collation.
- `language` for UI strings.
- IME, RTL, custom date/number formats per cell.

### Mobile / touch
- Touch support: tap, long-press, drag selection, mobile editors.
- Documented as supported but desktop-spreadsheet UX remains the primary focus.

### Other notable features
- **Comments** plugin — per-cell comments with rich popovers.
- **Context menu** plugin — right-click; fully customizable items.
- **Dropdown menu** plugin — column header menu (sort/filter/hide/freeze).
- **Manual column/row move** — drag to reorder.
- **Manual column/row resize** — drag border; auto-size on double-click.
- **Hidden columns/rows** plugin — programmatic + UI.
- **Fixed (frozen) columns** at start; **fixed rows** at top/bottom.
- **Merge cells** plugin — `mergeCells` config or runtime.
- **Conditional formatting** via `cells` callback or `className` rules.
- **Autofill / drag-down** — Excel-style fill handle (`fillHandle` plugin).
- **Undo/redo** plugin — full history; `hot.undo()`, `hot.redo()`.
- **Search** plugin — programmatic find with highlight.
- **Pagination** plugin — page through data.
- **Column summary** — sum/min/max/avg/count rows.
- **Custom borders** plugin.
- **Trim rows** plugin.
- **Bind rows with headers**.
- **`bindRowsWithHeaders` / `collapsibleColumns`** for nested header collapse.
- **Custom shortcuts** via `ShortcutManager`.

## API style
- **Imperative-leaning**. Configuration is declarative on init; runtime changes go through `hot.updateSettings({ ... })` or specific APIs.
- TypeScript: typings shipped, but the codebase is ~93% JavaScript so types are less generic than TanStack/AG Grid.
- Batteries-included.
- Hook-driven extension model: ~150 lifecycle hooks (`beforeChange`, `afterChange`, `beforeRender`, `afterRender`, `beforeKeyDown`, `afterSelection`, etc.).

## Bundle size
- Full UMD: ~700–800 KB minified, ~200 KB gzip with all plugins.
- Modular ESM build: each plugin separately importable; tree-shake to ~80–120 KB gzip for a basic configuration.
- HyperFormula adds ~190 KB gzip when formulas are enabled.

## Performance claims
- DOM virtualization tested up to ~50k rows comfortably; 1M+ requires custom paging on top.
- Demos: 100k rows / 100 cols with smooth scrolling.
- Performance regressions called out in changelog with v10.0 ("improved performance and consistency"); ongoing optimization in 17.x.

## Recurring weaknesses
1. **Licensing confusion** — non-commercial license is custom (not OSI). Many devs assume MIT and discover the commercial fee at deployment. License key required at runtime even for non-commercial.
2. **Pricing** — $999/yr/dev (subscription, not perpetual) priced at AG Grid Enterprise level despite a smaller feature set than AG Grid Enterprise.
3. **Bundle weight** — full build is heavy. Modular import works but is poorly documented relative to AG Grid's modules.
4. **Performance ceiling vs. AG Grid SSRM** — no first-class server-side row model. Beyond ~100k rows you build your own paging.
5. **JS-leaning typings** — TypeScript story trails libraries written in TS.
6. **No native Excel/PDF export** — only CSV; surprising given Handsontable's Excel-like positioning.

## Source URLs read
- https://handsontable.com/docs
- https://handsontable.com/pricing
- https://handsontable.com/docs/javascript-data-grid/api/options/
- https://github.com/handsontable/handsontable
- https://handsontable.com/blog/hyperformula-2.6.0-improved-performance-by-60
- https://github.com/handsontable/handsontable/issues/8773
