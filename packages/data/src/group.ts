// =============================================================================
// groupRows
//
// Build a tree of groups by N columns, with optional per-group aggregations.
//
// The tree uses adjacency-list storage: each GroupNode carries its children
// directly. Leaf nodes carry the source row indices that fell into that
// group. The renderer walks the tree (respecting expand/collapse state)
// and renders group rows + leaf rows interleaved.
//
// Multi-level grouping nests by column priority. With grouping ['region',
// 'product'], top-level nodes are unique regions; their children are unique
// products within each region; their leaves are the rows.
// =============================================================================

import type { AggregationModel, GroupingModel } from '@onegrid/protocol';
import type { ColumnTable } from './column-table';
import { aggregate as runAggregate } from './aggregate';

export interface GroupNode {
  /** The group-by column id at this depth. Empty string at the root. */
  readonly columnId: string;
  /** Distinct value for this group (e.g. region = 'EMEA'). null for the synthetic root. */
  readonly key: unknown;
  /** Path of ancestor keys including this node. Empty array for root. */
  readonly path: ReadonlyArray<unknown>;
  /** Direct children, if any. Mutually exclusive with `rowIndices`. */
  readonly children: ReadonlyArray<GroupNode>;
  /** Source row indices in this group (leaf nodes only). */
  readonly rowIndices: ReadonlyArray<number>;
  /** Aggregated values keyed by alias-or-`${fn}_${columnId}`. Always populated. */
  readonly aggregates: Readonly<Record<string, unknown>>;
  /** Total count of rows in this subtree. */
  readonly rowCount: number;
}

export interface GroupRowsOptions {
  /** Optional aggregations to compute per group node. */
  readonly aggregations?: AggregationModel;
  /** Subset of source rows to include. Defaults to every row. */
  readonly rowFilter?: (rowIndex: number) => boolean;
}

export function groupRows(
  table: ColumnTable,
  grouping: GroupingModel,
  options: GroupRowsOptions = {},
): GroupNode {
  const filter = options.rowFilter;
  const indices: number[] = [];
  for (let i = 0; i < table.numRows; i++) {
    if (!filter || filter(i)) indices.push(i);
  }
  return buildNode(table, indices, grouping.columns, [], options.aggregations ?? []);
}

function buildNode(
  table: ColumnTable,
  rowIndices: number[],
  remainingColumns: ReadonlyArray<string>,
  path: ReadonlyArray<unknown>,
  aggregations: AggregationModel,
): GroupNode {
  if (remainingColumns.length === 0) {
    return {
      columnId: '',
      key: path[path.length - 1] ?? null,
      path,
      children: [],
      rowIndices,
      aggregates: computeAggregates(table, rowIndices, aggregations),
      rowCount: rowIndices.length,
    };
  }
  const [columnId, ...rest] = remainingColumns;
  if (!columnId) {
    return {
      columnId: '',
      key: null,
      path,
      children: [],
      rowIndices,
      aggregates: computeAggregates(table, rowIndices, aggregations),
      rowCount: rowIndices.length,
    };
  }
  const buckets = bucketBy(table, rowIndices, columnId);
  const children = Array.from(buckets.entries())
    .map(([key, idxs]) => buildNode(table, idxs, rest, [...path, key], aggregations))
    .sort((a, b) => compareKeys(a.key, b.key));
  return {
    columnId,
    key: path[path.length - 1] ?? null,
    path,
    children,
    rowIndices: [],
    aggregates: computeAggregates(table, rowIndices, aggregations),
    rowCount: rowIndices.length,
  };
}

function bucketBy(
  table: ColumnTable,
  rowIndices: ReadonlyArray<number>,
  columnId: string,
): Map<unknown, number[]> {
  const column = table.column(columnId);
  const map = new Map<unknown, number[]>();
  for (const i of rowIndices) {
    const key = column.isNull(i) ? null : column.get(i);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = [];
      map.set(key, bucket);
    }
    bucket.push(i);
  }
  return map;
}

function computeAggregates(
  table: ColumnTable,
  rowIndices: ReadonlyArray<number>,
  aggregations: AggregationModel,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const agg of aggregations) {
    const key = agg.alias ?? `${String(agg.fn)}_${agg.columnId}`;
    out[key] = runAggregate(table, agg, rowIndices);
  }
  return out;
}

function compareKeys(a: unknown, b: unknown): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Flatten an open subset of the tree to a linear render order.
 *
 * Each entry is either a group header (with depth + key path) or a leaf row.
 * `openPaths` carries the set of group paths that are currently expanded;
 * a path is identified by `path.join('\u0000')`. A leaf is always rendered;
 * a group is rendered as a header, and if expanded, its children follow.
 */
export interface FlatGroupHeader {
  readonly kind: 'group';
  readonly depth: number;
  readonly node: GroupNode;
}

export interface FlatLeafRow {
  readonly kind: 'row';
  readonly depth: number;
  readonly rowIndex: number;
  readonly node: GroupNode;
}

export type FlatGroupEntry = FlatGroupHeader | FlatLeafRow;

export function flattenGroupTree(
  root: GroupNode,
  openPaths: ReadonlySet<string>,
): FlatGroupEntry[] {
  const out: FlatGroupEntry[] = [];
  walk(root, 0, false);
  return out;

  function walk(node: GroupNode, depth: number, isHeader: boolean): void {
    if (isHeader) {
      out.push({ kind: 'group', depth, node });
      const isOpen = openPaths.has(pathKey(node.path));
      if (!isOpen) return;
    }
    if (node.children.length > 0) {
      for (const child of node.children) {
        walk(child, depth + (isHeader ? 1 : 0), true);
      }
    } else {
      for (const idx of node.rowIndices) {
        out.push({ kind: 'row', depth: depth + (isHeader ? 1 : 0), rowIndex: idx, node });
      }
    }
  }
}

export function pathKey(path: ReadonlyArray<unknown>): string {
  return path.map((p) => (p === null || p === undefined ? '\u0001' : String(p))).join('\u0000');
}
