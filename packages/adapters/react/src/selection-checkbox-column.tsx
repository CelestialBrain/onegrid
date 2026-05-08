// =============================================================================
// createSelectionCheckboxColumn — a ready-made ColumnDef that renders a
// checkbox per row. Independent from the Grid's cell selection (which
// is for copy/paste/keyboard-nav); this set is what apps use for
// bulk-action semantics: "delete selected", "export selected", etc.
//
// The column re-uses the React cell-renderer pool, so the input
// element pool is bounded by viewport — not by dataset size — and
// scrolling reuses the same DOM nodes via update().
//
// State is owned by the consumer: pass `checkedRows` (a Set of row
// indices) and `onChange` (called with the next Set on every toggle).
// The factory also returns a `<SelectAllCheckbox />` component the
// consumer can drop above/below the grid to wire the "select all /
// deselect all" toolbar control. (A header-level checkbox needs a
// header renderer hook the core doesn't expose yet — v0.0.8.)
// =============================================================================

import {
  useCallback,
  useSyncExternalStore,
  type JSX,
} from 'react';
import type { CellRenderContext, ColumnDef } from '@onegrid/core';
import { createReactCellRenderer } from './cell-renderer';

export interface SelectionCheckboxColumnOptions {
  /** Currently-checked row indices. Identity changes trigger a re-render
   *  of the visible checkbox cells — the renderer pool's update() does
   *  the diffing. */
  readonly checkedRows: ReadonlySet<number>;
  /** Called with the next Set whenever the user toggles a row. The
   *  consumer is responsible for passing the new Set back via
   *  `checkedRows` so the visual state flips. */
  readonly onChange: (next: Set<number>) => void;
  /** Column width in CSS pixels. Default 36. */
  readonly width?: number;
  /** Column id. Default '__onegrid_select__'. */
  readonly id?: string;
}

/** Module-scoped subscription store, keyed by column id. The cell
 *  component subscribes to its column's store via
 *  `useSyncExternalStore` so it re-renders whenever the consumer
 *  passes a new checkedRows Set in. Without this, the renderer pool
 *  would never re-render the checkbox after a row toggle (its update()
 *  short-circuits when value/row/col are unchanged). */
interface Store {
  rows: ReadonlySet<number>;
  onChange: (next: Set<number>) => void;
  listeners: Set<() => void>;
}

const STORES = new Map<string, Store>();

function getStore(id: string): Store {
  let s = STORES.get(id);
  if (!s) {
    s = { rows: new Set(), onChange: () => undefined, listeners: new Set() };
    STORES.set(id, s);
  }
  return s;
}

function CheckboxCell(ctx: CellRenderContext): JSX.Element {
  const store = getStore(ctx.columnId);
  const rows = useSyncExternalStore(
    useCallback(
      (cb) => {
        store.listeners.add(cb);
        return () => {
          store.listeners.delete(cb);
        };
      },
      [store],
    ),
    () => store.rows,
  );
  const checked = rows.has(ctx.rowIndex);
  return (
    <input
      type="checkbox"
      aria-label={`Select row ${String(ctx.rowIndex + 1)}`}
      checked={checked}
      onChange={(e) => {
        const next = e.currentTarget.checked;
        const updated = new Set(store.rows);
        if (next) updated.add(ctx.rowIndex);
        else updated.delete(ctx.rowIndex);
        store.onChange(updated);
      }}
      style={{ margin: 0, cursor: 'pointer' }}
    />
  );
}

export function createSelectionCheckboxColumn(
  opts: SelectionCheckboxColumnOptions,
): ColumnDef {
  const id = opts.id ?? '__onegrid_select__';
  // Refresh the store on every factory call so the latest opts win.
  const store = getStore(id);
  store.rows = opts.checkedRows;
  store.onChange = opts.onChange;
  // Notify subscribers so already-mounted cells pick up the new Set.
  for (const fn of store.listeners) fn();

  const renderer = createReactCellRenderer({
    id: `react-${id}`,
    component: CheckboxCell,
  });

  return {
    id,
    width: opts.width ?? 36,
    displayName: '',
    format: () => '',
    renderer,
  };
}

export interface SelectAllCheckboxProps {
  readonly checkedRows: ReadonlySet<number>;
  readonly onChange: (next: Set<number>) => void;
  readonly totalRows: number;
  readonly className?: string;
  readonly label?: string;
}

/** Tri-state "select all" checkbox the consumer can render in their
 *  toolbar. checked=all rows in checkedRows; indeterminate=some;
 *  unchecked=none. Toggles either fill the set with [0..totalRows) or
 *  empty it. */
export function SelectAllCheckbox(props: SelectAllCheckboxProps): JSX.Element {
  const { checkedRows, onChange, totalRows } = props;
  const checked = checkedRows.size > 0 && checkedRows.size === totalRows;
  const indeterminate = checkedRows.size > 0 && checkedRows.size < totalRows;
  const setRef = useCallback(
    (el: HTMLInputElement | null): void => {
      if (el) el.indeterminate = indeterminate;
    },
    [indeterminate],
  );
  return (
    <label
      className={props.className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <input
        type="checkbox"
        ref={setRef}
        checked={checked}
        onChange={(e) => {
          if (e.currentTarget.checked) {
            const all = new Set<number>();
            for (let i = 0; i < totalRows; i++) all.add(i);
            onChange(all);
          } else {
            onChange(new Set());
          }
        }}
        aria-label={props.label ?? 'Select all rows'}
      />
      <span>{props.label ?? `${String(checkedRows.size)} of ${String(totalRows)} selected`}</span>
    </label>
  );
}
