// =============================================================================
// <ColumnToolPanel /> — sidebar panel for column visibility + reorder.
//
// Reads the live column array from a Grid instance, renders a
// checkbox per column, and writes back via grid.setColumns. Supports
// drag-to-reorder within the panel: HTML5 drag events update the
// list order and call grid.setColumns once on drop.
//
// Stateless beyond a transient drag-target index; long-term state
// lives in the Grid (mutable columns array). Mounting the panel
// elsewhere with a different Grid instance is fine — there is no
// global state.
//
// The grid prop is allowed to be null so consumers can render the
// panel before useOneGrid has resolved. Until then the panel renders
// an empty list.
// =============================================================================

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type JSX,
  type DragEvent as ReactDragEvent,
} from 'react';
import type { ColumnDef, Grid } from '@onegrid/core';

export interface ColumnToolPanelProps {
  readonly grid: Grid | null;
  /** Tag a column as not toggleable (e.g. a row-pin column). */
  readonly nonToggleableIds?: ReadonlyArray<string>;
  readonly style?: CSSProperties;
  readonly className?: string;
}

interface ListEntry {
  readonly column: ColumnDef;
  /** Synthetic "hidden" flag layered on top of the live column list.
   *  Hidden columns are kept in this panel's local state so they can
   *  be re-shown later; the live grid only ever sees visible columns. */
  readonly hidden: boolean;
}

export function ColumnToolPanel(props: ColumnToolPanelProps): JSX.Element {
  const { grid, nonToggleableIds, style, className } = props;
  const [entries, setEntries] = useState<ReadonlyArray<ListEntry>>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Re-sync from the live grid whenever it (re)mounts. The Grid's
  // column-reorder drag-drop also mutates the live array, but it
  // doesn't notify us — for simplicity, this panel is the
  // authoritative source while it's open. If the user expects
  // out-of-band changes to flow back, they can call setEntries
  // imperatively.
  useEffect(() => {
    if (!grid) {
      setEntries([]);
      return;
    }
    const cols = grid.getColumns();
    setEntries(cols.map((c) => ({ column: c, hidden: false })));
  }, [grid]);

  const flushVisible = useCallback(
    (next: ReadonlyArray<ListEntry>) => {
      setEntries(next);
      if (!grid) return;
      const visible = next.filter((e) => !e.hidden).map((e) => e.column);
      grid.setColumns(visible);
    },
    [grid],
  );

  const toggleHidden = useCallback(
    (id: string) => {
      flushVisible(
        entries.map((e) =>
          e.column.id === id ? { ...e, hidden: !e.hidden } : e,
        ),
      );
    },
    [entries, flushVisible],
  );

  const onDragStart = (i: number): void => {
    setDragIndex(i);
  };

  const onDragOver = (e: ReactDragEvent, _i: number): void => {
    e.preventDefault();
  };

  const onDrop = (i: number): void => {
    if (dragIndex === null || dragIndex === i) {
      setDragIndex(null);
      return;
    }
    const next = entries.slice();
    const moved = next.splice(dragIndex, 1)[0];
    if (!moved) {
      setDragIndex(null);
      return;
    }
    next.splice(i, 0, moved);
    flushVisible(next);
    setDragIndex(null);
  };

  const isToggleable = (id: string): boolean =>
    !nonToggleableIds || !nonToggleableIds.includes(id);

  return (
    <div
      className={className}
      style={{
        background: '#11141a',
        color: '#e7e9ec',
        border: '1px solid #2a2f37',
        borderRadius: 4,
        padding: '8px 10px',
        fontFamily: 'ui-sans-serif,system-ui,sans-serif',
        fontSize: 12,
        minWidth: 220,
        ...style,
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: 13,
          marginBottom: 8,
          color: '#a5b1c2',
        }}
      >
        Columns
      </div>
      <ul
        role="list"
        style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        {entries.map((e, i) => (
          <li
            key={e.column.id}
            draggable
            onDragStart={() => {
              onDragStart(i);
            }}
            onDragOver={(ev) => {
              onDragOver(ev, i);
            }}
            onDrop={() => {
              onDrop(i);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 6px',
              borderRadius: 3,
              cursor: 'grab',
              background: dragIndex === i ? '#1b1f26' : 'transparent',
            }}
          >
            <span style={{ color: '#7f8893', userSelect: 'none' }} aria-hidden>
              ⋮⋮
            </span>
            <input
              type="checkbox"
              checked={!e.hidden}
              disabled={!isToggleable(e.column.id)}
              onChange={() => {
                toggleHidden(e.column.id);
              }}
              aria-label={`Toggle ${e.column.displayName ?? e.column.id} visibility`}
            />
            <span>{e.column.displayName ?? e.column.id}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
