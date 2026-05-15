// =============================================================================
// @onegrid/data-worker/worker
//
// Worker-side dispatcher. Authors who don't need custom logic can import
// this file directly as their Worker entrypoint:
//
//   // my-worker.ts
//   export {} from '@onegrid/data-worker/worker';
//
// Exposes four handlers — `sort`, `filter`, `group`, `pivot` — each
// delegating to the corresponding @onegrid/data function. Results flow
// through the @onegrid/worker-plugins protocol; transferable typed
// arrays + ArrayBuffers travel zero-copy.
// =============================================================================

import { definePluginWorker } from '@onegrid/worker-plugins/worker';
import {
  sortIndex,
  filterIndex,
  groupRows,
  pivot,
  type SortOptions,
  type FilterOptions,
  type GroupRowsOptions,
} from '@onegrid/data';
import type { ColumnTable } from '@onegrid/data';
import type {
  SortModel,
  FilterModel,
  GroupingModel,
  PivotModel,
} from '@onegrid/protocol';

export interface SortInput {
  readonly table: ColumnTable;
  readonly sort: SortModel;
  readonly options?: SortOptions;
}
export interface FilterInput {
  readonly table: ColumnTable;
  readonly filter: FilterModel;
  readonly options?: FilterOptions;
}
export interface GroupInput {
  readonly table: ColumnTable;
  readonly grouping: GroupingModel;
  readonly options?: GroupRowsOptions;
}
export interface PivotInput {
  readonly table: ColumnTable;
  readonly model: PivotModel;
}

definePluginWorker({
  handlers: {
    sort: (input: SortInput) =>
      sortIndex(input.table, input.sort, input.options),
    filter: (input: FilterInput) =>
      filterIndex(input.table, input.filter, input.options),
    group: (input: GroupInput) =>
      groupRows(input.table, input.grouping, input.options),
    pivot: (input: PivotInput) => pivot(input.table, input.model),
  },
});
