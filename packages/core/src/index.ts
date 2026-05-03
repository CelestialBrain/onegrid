// =============================================================================
// @onegrid/core
//
// Framework-agnostic engine. Owns the canvas renderer, accessibility shadow
// DOM, signals reactive substrate, layout (Fenwick-tree row heights),
// selection model, editor/menu overlay layer, and keyboard navigation.
//
// Public API surface (planned). Implementations TODO.
// =============================================================================

import type { DataSource, Schema, SortModel, FilterModel } from '@onegrid/protocol';

export interface ColumnDef {
  readonly id: string;
  readonly width?: number;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly pinned?: 'left' | 'right';
  readonly sortable?: boolean;
  readonly filterable?: boolean;
  readonly resizable?: boolean;
  readonly headerName?: string;
}

export interface GridOptions {
  readonly container: HTMLElement;
  readonly columns: ReadonlyArray<ColumnDef>;
  readonly dataSource: DataSource;
  readonly rowHeight?: number | ((rowIndex: number) => number);
  readonly headerHeight?: number;
  readonly initialSort?: SortModel;
  readonly initialFilter?: FilterModel;
}

export interface Grid {
  readonly schema: () => Schema;
  readonly setSort: (sort: SortModel) => void;
  readonly setFilter: (filter: FilterModel) => void;
  readonly scrollToRow: (rowIndex: number) => void;
  readonly destroy: () => void;
}

export const createGrid = (_options: GridOptions): Grid => {
  throw new Error('@onegrid/core: createGrid is not implemented yet.');
};

export type { DataSource, Schema, SortModel, FilterModel } from '@onegrid/protocol';
