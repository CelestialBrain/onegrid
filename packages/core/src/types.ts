// =============================================================================
// Core types for @onegrid/core.
// =============================================================================

import type { SelectionSnapshot } from './selection';
import type { SortModel } from '@onegrid/protocol';

/**
 * Per-column configuration. Width is the only required visual property; the
 * rest is callbacks the renderer invokes per cell.
 */
export interface ColumnDef<TValue = unknown> {
  readonly id: string;
  readonly width: number;
  readonly displayName?: string;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly pinned?: 'left' | 'right';
  /** Formatter the renderer invokes to convert a cell value to display text. */
  readonly format?: (value: TValue, rowIndex: number) => string;
  /** Optional per-cell foreground color. */
  readonly color?: (value: TValue, rowIndex: number) => string | undefined;
  /** Optional per-cell background color. */
  readonly background?: (value: TValue, rowIndex: number) => string | undefined;
  /** Optional editor validator. Sync result keeps editor instant on
   *  every input keystroke; async result is awaited at commit time
   *  with AbortController so a fast-typing user never sees stale
   *  validation. Rejection keeps the editor open and announces the
   *  message via the live region. */
  readonly validate?: (
    value: string,
    context: ValidationContext,
  ) => ValidationResult | Promise<ValidationResult>;
  /** Custom DOM-based cell renderer. When set, the canvas paints a
   *  blank cell background and the rendered DOM element is positioned
   *  in the overlay layer above the canvas. The grid pools instances
   *  per renderer id so framework reactivity (React/Vue/Svelte/Solid)
   *  is preserved across scroll — only on-screen cells are mounted,
   *  off-screen cells return to the pool with their state reset. */
  readonly renderer?: CellRenderer;
  /** Custom editor variant. Default: a single-line text input. Use
   *  this to swap in a `<select>` dropdown, date picker, large-text
   *  textarea, autocomplete, multi-select, or any custom widget that
   *  implements the `CellEditor` interface. */
  readonly editor?: CellEditor;
  /** Optional tooltip content for cells in this column. String content
   *  renders as plain text; HTMLElement content renders as-is (use for
   *  rich tooltips like multi-line summaries or status indicators).
   *  Returning null/undefined suppresses the tooltip for that cell.
   *  Tooltips appear after a hover delay and dismiss on pointer-leave,
   *  Escape, or scroll. */
  readonly tooltip?: (
    value: TValue,
    rowIndex: number,
  ) => string | HTMLElement | null | undefined;
}

/** Per-cell render context handed to a CellRenderer's mount/update/
 *  reset hooks. Same shape as the `format` / `color` callbacks but
 *  with the rendered DOM element in scope so consumers can mutate it. */
export interface CellRenderContext {
  readonly value: unknown;
  readonly rowIndex: number;
  readonly columnId: string;
}

/**
 * Custom cell renderer interface.
 *
 * Renderers are framework-agnostic and DOM-only at this layer. The
 * core grid never instantiates React / Vue / Svelte / Solid components
 * directly — framework adapters wrap their component-per-cell pattern
 * in a CellRenderer and pass it through ColumnDef.renderer.
 *
 * Lifecycle:
 *   1. mount()   — produce a fresh DOM node when the pool is empty
 *                  for this renderer's id. Run once per pooled instance.
 *   2. update()  — called every frame the cell is visible, with the
 *                  current value/row/col. Should be cheap; do not
 *                  re-create the framework root inside.
 *   3. reset()   — called when the cell scrolls out of view and the
 *                  instance returns to the pool. Clear focus, transient
 *                  state, listeners that reference the previous cell.
 */
export interface CellRenderer {
  /** Stable identifier — used as the pool key. Two renderers with the
   *  same `id` share their pooled instances; with different ids each
   *  has its own pool. Pick something descriptive: `"status-pill"`,
   *  `"sparkline-line"`, etc. */
  readonly id: string;
  readonly mount: (context: CellRenderContext) => HTMLElement;
  readonly update: (el: HTMLElement, context: CellRenderContext) => void;
  readonly reset?: (el: HTMLElement) => void;
}

/**
 * Per-edit context handed to a CellEditor's mount() hook. Same shape
 * as the renderer context plus the initial text (for type-ahead) and
 * the formatted display text the user was looking at before they
 * started editing.
 */
export interface CellEditContext {
  readonly value: unknown;
  readonly rowIndex: number;
  readonly columnId: string;
  readonly displayText: string;
  /** Set when the editor was opened by typing a printable key on a
   *  selected cell. Editors may want to use this as the initial value
   *  instead of `displayText`. */
  readonly initialText?: string;
}

/**
 * Custom cell editor variant.
 *
 * Variants compose onto the existing validated editor pipeline: the
 * grid handles positioning, focus management, IME composition, paste,
 * Escape-to-cancel, Enter-to-commit, and validator dispatch. The
 * variant just describes how to build + read the input widget.
 *
 * Examples (shipped as helpers in @onegrid/core/editing):
 *   createSelectEditor({ options })         — <select>
 *   createDateEditor()                      — <input type="date">
 *   createTextareaEditor()                  — multi-line <textarea>
 *
 * Lifecycle:
 *   1. mount() — called once per beginEdit. Return a fresh instance.
 *   2. instance.focus() — called by the grid after positioning.
 *   3. instance.getValue() — called on commit to extract the string.
 *   4. instance.destroy?.() — called when the editor closes (commit
 *      or cancel). The grid removes the element itself; this is for
 *      listener cleanup or framework root unmount.
 */
export interface CellEditor {
  readonly id: string;
  readonly mount: (context: CellEditContext) => CellEditorInstance;
}

export interface CellEditorInstance {
  /** Root DOM element the grid will position over the cell. */
  readonly element: HTMLElement;
  /** Read the current edit value as a string for commit. */
  readonly getValue: () => string;
  /** Focus the inner widget. Called by the grid after mount. */
  readonly focus: () => void;
  /** Optional teardown — listeners, framework roots, etc. */
  readonly destroy?: () => void;
}

export interface ValidationContext {
  readonly rowIndex: number;
  readonly columnId: string;
  /** Phase the validator is being invoked in. `input` runs on every
   *  keystroke (debounced); `commit` runs when the user attempts to
   *  finalize the edit. Async validators may want to skip `input`
   *  and only run on `commit` to avoid unnecessary network traffic. */
  readonly phase: 'input' | 'commit';
}

export type ValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      /** Human-readable error message rendered in the editor's
       *  error bubble and announced via aria-live. */
      readonly message: string;
      readonly severity?: 'error' | 'warning';
    };

/**
 * Synchronous random-access row reader. The renderer calls `getCell` once per
 * visible cell per frame; allocations and async operations on this hot path
 * will tank FPS. RowSources backed by remote data (SSRM) cache blocks ahead
 * of time and serve cell reads from local typed arrays.
 */
export interface RowSource {
  readonly numRows: number;
  readonly getCell: (rowIndex: number, columnId: string) => unknown;
}

/**
 * Per-frame statistics emitted via `onFrame`. Same shape exposed in the
 * playground's live meter.
 */
export interface FrameStats {
  readonly fps: number;
  readonly visibleRowStart: number;
  readonly visibleRowEnd: number;
  readonly drawCellsPerFrame: number;
  readonly drawDurationMs: number;
}

/**
 * Aggregate metrics for a benchmark scenario.
 */
export interface MetricsSnapshot {
  readonly windowMs: number;
  readonly frameCount: number;
  readonly fpsAvg: number;
  readonly intervalMsP50: number;
  readonly intervalMsP95: number;
  readonly intervalMsP99: number;
  readonly drawMsP50: number;
  readonly drawMsP95: number;
  readonly drawMsP99: number;
  readonly longFramesGt16: number;
  readonly longFramesGt33: number;
  readonly longFramesGt50: number;
  readonly scrollPxTotal: number;
  readonly cellsPerFrameAvg: number;
  readonly heapUsedBytes?: number;
}

/** Theme tokens consumed by the canvas renderer. */
export interface GridTheme {
  readonly background: string;
  readonly altRowBackground: string;
  readonly headerBackground: string;
  readonly text: string;
  readonly mutedText: string;
  readonly border: string;
  readonly fontFamily: string;
  readonly fontSize: number;
}

/** Discriminated union describing what the user right-clicked. The
 *  consumer's onContextMenu handler reads `kind` and reaches for the
 *  fields appropriate for that variant. */
export type ContextMenuTarget =
  | {
      readonly kind: 'cell';
      readonly rowIndex: number;
      readonly columnId: string;
      readonly clientX: number;
      readonly clientY: number;
    }
  | {
      readonly kind: 'header';
      readonly columnId: string;
      readonly clientX: number;
      readonly clientY: number;
    }
  | {
      readonly kind: 'empty';
      readonly clientX: number;
      readonly clientY: number;
    };

export const DEFAULT_THEME: GridTheme = {
  background: '#0b0d10',
  altRowBackground: '#11141a',
  headerBackground: '#1b1f26',
  text: '#e7e9ec',
  mutedText: '#8b929c',
  border: '#1c2027',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
  fontSize: 13,
};

export interface GridOptions {
  /** DOM element to mount into. */
  readonly host: HTMLElement;
  /** Column definitions, left-to-right in display order. */
  readonly columns: ReadonlyArray<ColumnDef>;
  /** Synchronous row reader. */
  readonly rowSource: RowSource;
  /** Per-row heights. If a single number, applied uniformly. */
  readonly rowHeight: number | Float32Array;
  /** Header band height in CSS pixels. Default 32. */
  readonly headerHeight?: number;
  /** Number of left-pinned columns. Default 0. */
  readonly frozenColumnCount?: number;
  /** Theme tokens. Defaults to a dark palette. */
  readonly theme?: Partial<GridTheme>;
  /** Per-frame callback for live FPS meters. */
  readonly onFrame?: (stats: FrameStats) => void;
  /** Fires whenever the selection changes (click, drag, keyboard, programmatic). */
  readonly onSelectionChange?: (selection: SelectionSnapshot) => void;
  /** Current sort state. Renderer draws ▲/▼ in matching column headers.
   *  Caller owns the state — change in response to onHeaderClick and re-pass
   *  via setSort(). */
  readonly sort?: SortModel;
  /** Fires when the user clicks a column header. Use to toggle sort, open a
   *  filter menu, etc. Receives the columnId. */
  readonly onHeaderClick?: (columnId: string) => void;

  // ---- Column reorder (drag-and-drop) ----

  /** Allow dragging column headers left/right to reorder the columns
   *  array. When enabled, the grid splices its internal column array
   *  on drop and fires `onColumnReorder` so consumers can persist the
   *  new order. Default: false. */
  readonly enableColumnReorder?: boolean;

  /** Fires when a drag-reorder lands. Indices are post-reorder
   *  positions in the visible column array; the grid has already
   *  applied the move internally. Consumers should mirror the change
   *  in their own state so subsequent re-mounts see the same order. */
  readonly onColumnReorder?: (
    fromIndex: number,
    toIndex: number,
    columnId: string,
  ) => void;

  // ---- Context menu ----

  /** Fires on right-click (or pointerType=touch long-press) over any
   *  part of the grid. The Grid calls `preventDefault()` on the native
   *  event so the browser menu doesn't show — the consumer is then
   *  responsible for rendering their own menu (e.g. a popover) at the
   *  reported client coordinates.
   *
   *  Payload tells the consumer what was right-clicked so the menu
   *  can present contextual actions:
   *   - kind='cell'   : a data cell (rowIndex + columnId set)
   *   - kind='header' : a column header (columnId set, no rowIndex)
   *   - kind='empty'  : the grid background, below all rows
   */
  readonly onContextMenu?: (target: ContextMenuTarget) => void;

  // ---- Master-detail (expandable rows) ----

  /** Set of currently-expanded row indices. The renderer reserves
   *  `detailHeight` extra space below each expanded row and calls
   *  `getDetailContent` to render the panel. */
  readonly expanded?: ReadonlySet<number> | ReadonlyArray<number>;

  /** Pixels of detail content per expanded row. Default 200. */
  readonly detailHeight?: number;

  /** Returns the DOM element to mount in the detail panel for a given row.
   *  Return null to suppress the panel even though the row is in `expanded`.
   *  The Grid manages mount/unmount lifecycle and positioning; the caller
   *  is responsible only for producing the element. Re-mounted on layout
   *  changes (sort/filter); cache externally if construction is expensive. */
  readonly getDetailContent?: (rowIndex: number) => HTMLElement | null;

  /** Fires when the user clicks the chevron column on a row.
   *  Caller owns the expanded state and passes it back via `expanded`. */
  readonly onToggleExpand?: (rowIndex: number) => void;

  /** Called just before the grid removes a detail panel from the DOM
   *  (row collapsed OR scrolled out of view). Use this to tear down
   *  any nested resources the panel owns — e.g. a nested Grid created
   *  inside `getDetailContent` should call its `destroy()` here. */
  readonly onDetailUnmount?: (rowIndex: number, el: HTMLElement) => void;

  // ---- Cell editing ----

  /** Whether cells are editable. Pass a predicate to gate per cell.
   *  Default: not editable. */
  readonly editable?: boolean | ((rowIndex: number, columnId: string) => boolean);

  /** Fires when the user commits an edit (Enter, Tab, or focus loss).
   *  The grid does NOT mutate the row source itself — the consumer is
   *  responsible for writing the value back. `newValue` is the raw
   *  string from the editor; coerce as needed. */
  readonly onCellEdit?: (
    rowIndex: number,
    columnId: string,
    newValue: string,
    oldValue: unknown,
  ) => void;

  /** Fires when an edit session begins (F2, Enter, double-click, or
   *  type-ahead). Use to log/analytics; cancel by ignoring (the grid
   *  begins regardless). */
  readonly onBeginEdit?: (rowIndex: number, columnId: string) => void;

  /** Fires on Cmd/Ctrl+V when the grid has focus. The clipboard text
   *  is parsed as TSV and delivered as a 2D array of strings; the
   *  consumer writes them to whichever data source it owns, anchored
   *  at the current active cell. */
  readonly onPaste?: (
    anchorRow: number,
    anchorCol: number,
    rows: ReadonlyArray<ReadonlyArray<string>>,
  ) => void;

  // ---- Pinned rows ----

  /** Optional read-only RowSource pinned to the top of the viewport,
   *  below the header. Common use: aggregation/totals rows. Cells use
   *  the same column ids; the source's getCell is read each frame. */
  readonly pinnedTopRowSource?: RowSource;

  /** Symmetric pinned-bottom source. */
  readonly pinnedBottomRowSource?: RowSource;

  /** Fixed row height (CSS px) for pinned bands. Default 28. Pinned
   *  rows do not support per-row variable heights. */
  readonly pinnedRowHeight?: number;

  // ---- Column groups (header tree) ----

  /** Optional grouping band. Each entry spans `children.length` adjacent
   *  columns starting from the first un-grouped column. The header
   *  band height doubles when at least one group is supplied. */
  readonly columnGroups?: ReadonlyArray<ColumnGroupDef>;

  // ---- Status bar ----

  /** Show a status band below the data area summarizing the current
   *  selection: count plus min/max/sum/avg for numeric cells. Default
   *  false. */
  readonly statusBar?: boolean;

  // ---- Floating filter row ----

  /** Render a per-column filter input row pinned just below the
   *  column headers. Each visible column gets a `<input>` aligned
   *  with its band; typing fires `onFloatingFilterChange`. Default
   *  false. */
  readonly floatingFilters?: boolean;

  /** Called when a floating filter input changes. The grid does not
   *  apply the filter itself — the consumer translates the value to
   *  whatever FilterModel makes sense for that column (substring,
   *  numeric range, etc.) and threads it through the data source. */
  readonly onFloatingFilterChange?: (columnId: string, value: string) => void;

  // ---- Row grouping ----

  /** Per-row metadata hook. Return a RowGroupMeta to render the row as
   *  a group header (with chevron, indent, label, count, aggregates).
   *  Return null/undefined for normal data rows. The renderer calls
   *  this once per visible row per frame, so keep it cheap (typically
   *  a Map lookup keyed on rowIndex). */
  readonly getRowMeta?: (rowIndex: number) => RowMeta | null | undefined;

  /** Fires when the user clicks a group's chevron. Receives the
   *  RowGroupMeta.path so the caller can flip its expansion state and
   *  rebuild the wrapped RowSource. */
  readonly onToggleGroup?: (path: string) => void;
}

export interface ColumnGroupDef {
  /** Display label drawn in the top header band. */
  readonly label: string;
  /** Column ids spanned by this group, in display order. */
  readonly columnIds: ReadonlyArray<string>;
  /** Optional band background. */
  readonly background?: string;
}

/**
 * Per-row hint that switches how the renderer paints a row. Returned
 * from `GridOptions.getRowMeta(rowIndex)`. Null/undefined means the row
 * is a normal data row (default rendering).
 */
export interface RowGroupMeta {
  readonly kind: 'group';
  /** Nesting level (0 = top-level group). Used for left indent. */
  readonly depth: number;
  /** Group label drawn in the row's left side. */
  readonly label: string;
  /** Stable id used by `onToggleGroup` to identify the group. */
  readonly path: string;
  /** Whether this group is currently expanded (children visible). */
  readonly expanded: boolean;
  /** Number of rows under this group. Drawn next to the label. */
  readonly count?: number;
  /** Aggregate values per column, drawn in the row's column slots. */
  readonly aggregates?: Record<string, unknown>;
}

/**
 * Row meta for hierarchical tree data (parent → child). Renderer
 * paints a chevron + indent matching `depth`, then falls through to
 * normal cell rendering for the row's columns. `onToggleGroup` is
 * the same callback used for groups — the tree's node `id` rides as
 * the `path` argument so consumers route both via one handler.
 */
export interface RowTreeMeta {
  readonly kind: 'tree';
  readonly depth: number;
  /** Stable node id; round-trips through onToggleGroup. */
  readonly id: string;
  /** Whether the children are visible. */
  readonly expanded: boolean;
  /** True when this node has no children AND no loader. Renderer
   *  paints no chevron for leaves. */
  readonly isLeaf: boolean;
  /** True when expanding could reveal children (children present OR
   *  loader supplied). When false but expanded, we render the chevron
   *  in expanded state but no indent change beneath. */
  readonly hasChildren: boolean;
}

export type RowMeta = RowGroupMeta | RowTreeMeta;
