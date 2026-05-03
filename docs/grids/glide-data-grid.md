# Glide Data Grid

**Source**: https://docs.grid.glideapps.com/
**Repo**: https://github.com/glideapps/glide-data-grid
**License**: MIT
**Pricing**: Free, MIT.
**Latest version**: 6.0.3 (2024-02-03 per GitHub releases). Maintenance has slowed since late 2024 — sporadic patch activity, but no large feature releases in ~2025–2026.
**Stars**: ~5.2k
**Maintenance**: Passive / community-maintained. Open issues stack: ~87 at time of survey. Glide (the company) uses it internally; external maintenance cadence is irregular.

## Architecture
- **HTML Canvas rendering**. Not DOM. The grid paints cells into a `<canvas>` each frame, recycling per visible region.
- Maintainers' rationale: *"Once you need to load/unload hundreds of DOM elements per frame nothing can save you."*
- React-only public API. Core renderer is reactish but tightly coupled to React 16+ for state management and component tree.
- TypeScript-first (~99% TS).
- State model: pull-based via `getCellContent([col, row])` callback. The grid asks for a cell when it's about to paint; you respond synchronously. No virtual data array required.
- Edits, selections, paste are events back to the host application via callbacks.

## Framework support
- **React** — first-class. React 16, 17, 18, 19.
- **Vue / Angular / Svelte / Solid / vanilla** — no first-party support. Possible to wrap React in a web component but no official adapter.
- **SSR** — broken without `ssr: false` dynamic import. Requires `next/dynamic` in Next.js.

## Features

### Sorting
- **Not built-in.** Application-side. You sort your data store and re-render; grid has no sort UI.
- Header click events available; you draw a sort arrow yourself.

### Filtering
- **Not built-in.** Same model — filter your data, the grid renders what `getCellContent` returns.

### Grouping
- **Not natively supported.** No row-group concept.
- Has "column groups" (header grouping), but no row hierarchy.

### Pivoting
- Not supported.

### Aggregations
- Not supported.

### Editing
- Built-in. `onCellEdited([col, row], newValue)` callback.
- Per-cell `readonly` flag in cell shape.
- Built-in editors per cell kind (text input, number input, boolean toggle, image picker overlay).
- `provideEditor` for custom editors (returns a React component overlay).
- Validation: app-side; reject the edit by not committing.

### Selection
- **Cell selection**: single cell, ranges (Excel-like), and multi-rect (Ctrl+drag for additional rects).
- **Row selection**: single, multiple, range with Shift, all-via-checkbox (in row-marker column).
- **Column selection**: single + range.
- `gridSelection` state shape: `{ current?: { cell, range, rangeStack }, columns: CompactSelection, rows: CompactSelection }`.
- `CompactSelection` is a packed range datatype optimized for million-row selections.

### Clipboard / copy-paste
- Built-in, configurable.
- `onPaste` callback receives target + 2D array of strings.
- Copy serializes the current selection to TSV (Excel-compatible).
- `onCellsEdited` receives a batch of edits from a paste.

### Virtualization
- **Canvas-level** virtualization. Only the visible region is painted; off-screen cells are never rendered.
- Lazy `getCellContent` makes million-row grids feasible without ever holding all data.
- Variable row heights supported.
- Frozen columns + frozen trailing rows.

### Accessibility
- **Acknowledged weak point.** Maintainer quote: *"Unfortunately none of the primary developers are accessibility users so there are likely flaws in the implementation we are not aware of."*
- Some screen-reader plumbing exists (off-canvas DOM mirror) but not certified.
- Canvas rendering is fundamentally hostile to screen readers compared to DOM grids.
- Keyboard navigation works (arrows, Tab, Enter, Page Up/Down, Home/End, Ctrl+arrows).

### Server-side row model
- The pull model effectively *is* an SSRM. `getCellContent` can be async-backed: return a `Loading` cell, kick off a fetch, and re-render when data arrives.
- No first-party block-loading helper, but the pattern is documented.

### Streaming / live updates
- `getCellContent` re-asked on demand; calling `dataEditorRef.updateCells([{ cell: [col, row] }])` invalidates specific cells.
- High-frequency: invalidate the visible region by ref, repaint loop maintains 60 FPS for thousands of cells/sec.

### Formulas / computed cells
- Not built-in.
- Cells can return computed `displayData` based on `data`. No formula engine, no dependency graph.

### Theming / customization / custom cell renderers
- Theme object with ~30 tokens (`bgCell`, `bgHeader`, `textHeader`, `accentColor`, fonts, paddings, borders).
- Per-column `themeOverride`.
- **Custom cell renderers** are required to draw to canvas (not React). Interface:
  ```ts
  interface CustomRenderer<T extends CustomCell> {
    kind: GridCellKind.Custom;
    isMatch: (cell: GridCell) => cell is T;
    draw: (args: DrawArgs<T>, cell: T) => boolean | void;
    provideEditor?: (cell: T) => ProvideEditorCallback<T>;
    onPaste?: (val: string, cellData: T['data']) => T['data'];
  }
  ```
- Overlay editors (the popup when you double-click) are React components, separate from the canvas draw.

### Export
- **Not built-in.** Copy-to-TSV exists, full export is your job.

### Master / detail rows
- Not supported.

### Tree data
- Limited. No tree row model, but cells of `kind: Drilldown` can simulate hierarchy visually with custom logic.

### Charts integration
- Sparklines / charts are not built-in. You can paint anything via custom cells (canvas).

### Internationalization
- No locale system. Text inputs respect browser IME (with caveats — see issue #1175 CJK).
- RTL not officially supported.

### Mobile / touch
- Touch supported (scroll, tap, long-press) but not optimized. Mobile UX is rough.

### Other notable features
- **Cell kinds** built-in: `Text`, `Number`, `Boolean`, `Markdown`, `Bubble`, `Image`, `Drilldown`, `Uri`, `RowID`, `Loading`, `Protected`, `Custom`.
- **Drag-fill (fill handle)** — Excel-style drag corner.
- **Search overlay** — `showSearch={true}` + `onSearchValueChange`. Uses `getCellsForSelection` to scan.
- **Column resizing** + **column reordering** (drag headers).
- **Frozen columns** (`freezeColumns: number`) and **frozen trailing rows** (`freezeTrailingRows: number`).
- **Row markers** — `rowMarkers: 'none' | 'number' | 'checkbox' | 'both' | 'clickable-number'`.
- **Header icons** — built-in glyphs + custom SVG.
- **Group columns** in header.
- **Cell overlays** — the popup editor.
- **`useCustomCells`** hook to plug in extra cell kinds.
- **`onColumnResize`, `onColumnMoved`, `onRowMoved`, `onCellActivated`, `onCellClicked`, `onHeaderMenuClick`** event surface.

## API style
- Declarative React component (`<DataEditor />`) with many callback props.
- Imperative escape via `dataEditorRef` (`updateCells`, `scrollTo`, `getBounds`, `focus`).
- Pull-data model: `getCellContent([col, row])` is the source of truth. No data-array prop.
- Headless data, batteries-included rendering.

## Bundle size
- `@glideapps/glide-data-grid` core: ~80–100 KB min+gzip.
- Peer deps: `lodash`, `marked`, `react-responsive-carousel`. Adds another ~70 KB if not deduped.
- Single-bundle; no module subdivision.

## Performance claims
- Documented to handle "millions of rows" and "millions of cells" via lazy paint.
- Native scroll velocity; no row-recycle jank since canvas paints continuously.
- Maintainer demos: 1M rows × 100 cols at 60 FPS on a mid-tier laptop.
- No published synthetic benchmark suite.

## Recurring weaknesses
1. **Accessibility** — explicitly acknowledged. Canvas rendering is the architectural cause.
2. **Maintenance cadence** has slowed; many open issues sit. Patches arrive but feature work is rare.
3. **Firefox bugs** — issue [#1164](https://github.com/glideapps/glide-data-grid/issues/1164) horizontal scrolling broken in Firefox.
4. **No first-class Vue/Angular/Svelte/Solid wrappers** — React-only practical use.
5. **Custom rendering complexity** — you must draw to canvas (rect, fillText, paths). DOM-mental-model React devs find this jarring.
6. **No sorting/filtering/grouping/pivoting/export** built-in. The grid is a renderer + interaction layer; data ops are the app's problem.
7. **Mobile / touch UX** is rough; CJK input, theme override edge cases (#1180), pre-release versioning (#1162).

## Source URLs read
- https://github.com/glideapps/glide-data-grid
- https://docs.grid.glideapps.com/
- https://github.com/glideapps/glide-data-grid/blob/main/packages/core/README.md
- https://github.com/glideapps/glide-data-grid/issues
- https://github.com/glideapps/glide-data-grid/issues/1164
- https://github.com/glideapps/glide-data-grid/issues/1175
- https://github.com/glideapps/glide-data-grid/issues/1180
- https://github.com/glideapps/glide-data-grid/issues/1183
