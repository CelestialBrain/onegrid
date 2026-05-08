// =============================================================================
// fingerprint
//
// Canonicalize a (sort, filter, grouping, pivot) query into a deterministic
// string. Equal queries produce equal fingerprints; different queries produce
// different fingerprints. Used as the cache-key prefix for SsrmDataSource so
// blocks fetched under sort A don't collide with blocks fetched under sort B.
// =============================================================================

import type {
  FilterModel,
  FilterNode,
  GroupingModel,
  PivotModel,
  SortModel,
} from '@onegrid/protocol';

export function fingerprintQuery(
  sort: SortModel,
  filter: FilterModel,
  grouping?: GroupingModel,
  pivot?: PivotModel,
  parentId?: string | null,
): string {
  const obj = {
    s: sort.map((field) => ({
      c: field.columnId,
      d: field.direction,
      n: field.nulls ?? 'last',
    })),
    f: canonicalizeFilter(filter),
    g: grouping
      ? {
          c: [...grouping.columns],
          k: grouping.openKeys.map((path) => [...path]),
        }
      : null,
    p: pivot
      ? {
          r: [...pivot.rows],
          c: [...pivot.columns],
          m: pivot.measures.map((agg) => ({
            c: agg.columnId,
            fn: agg.fn,
            a: agg.alias ?? null,
          })),
        }
      : null,
    // parentId participates in fingerprinting so children blocks for
    // different parents are cached independently. `undefined` and `null`
    // collapse to the same canonical representation (root level).
    pid: parentId == null ? null : parentId,
  };
  return JSON.stringify(obj);
}

function canonicalizeFilter(filter: FilterModel): unknown {
  if (filter === null) return null;
  return canonicalizeNode(filter);
}

function canonicalizeNode(node: FilterNode): unknown {
  if (node.type === 'comparison') {
    return {
      t: 'c',
      c: node.columnId,
      o: node.op,
      v: node.value === undefined ? null : node.value,
      vs: node.values ? [...node.values] : null,
      cs: node.caseSensitive ?? false,
    };
  }
  return {
    t: 'l',
    o: node.op,
    f: node.filters.map(canonicalizeNode),
  };
}
