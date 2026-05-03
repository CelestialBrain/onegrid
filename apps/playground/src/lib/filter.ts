/**
 * Filter helpers for the playground:
 *
 *   buildQuickFilter(query, columnIds) — fans one query out as
 *     case-insensitive `contains` ORed across every column. AG Grid's
 *     "Quick Filter" equivalent.
 *
 *   buildColumnFilter(rules) — builds a structured FilterModel from a
 *     list of per-column rules with operator pickers. Combines via AND.
 *     Used by the per-column filter UI below the toolbar.
 */

import type { FilterModel } from '@onegrid/react';

export function buildQuickFilter(
  query: string,
  columnIds: ReadonlyArray<string>,
): FilterModel {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (columnIds.length === 1) {
    return {
      type: 'comparison',
      columnId: columnIds[0]!,
      op: 'contains',
      value: trimmed,
      caseSensitive: false,
    };
  }
  return {
    type: 'logical',
    op: 'or',
    filters: columnIds.map((columnId) => ({
      type: 'comparison',
      columnId,
      op: 'contains',
      value: trimmed,
      caseSensitive: false,
    })),
  };
}

// -----------------------------------------------------------------------------
// Per-column filter rules
// -----------------------------------------------------------------------------

export type FilterOp =
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'isNull'
  | 'isNotNull';

export interface FilterRule {
  /** Stable id for React keys + remove operations. */
  readonly id: string;
  readonly columnId: string;
  readonly op: FilterOp;
  /** Empty string for unary ops (isNull/isNotNull). */
  readonly value: string;
}

export const FILTER_OPS: ReadonlyArray<{ op: FilterOp; label: string; unary?: boolean }> = [
  { op: 'eq', label: '=' },
  { op: 'neq', label: '≠' },
  { op: 'lt', label: '<' },
  { op: 'lte', label: '≤' },
  { op: 'gt', label: '>' },
  { op: 'gte', label: '≥' },
  { op: 'contains', label: 'contains' },
  { op: 'startsWith', label: 'starts with' },
  { op: 'endsWith', label: 'ends with' },
  { op: 'isNull', label: 'is empty', unary: true },
  { op: 'isNotNull', label: 'is not empty', unary: true },
];

const UNARY_OPS = new Set<FilterOp>(['isNull', 'isNotNull']);

export function isUnaryOp(op: FilterOp): boolean {
  return UNARY_OPS.has(op);
}

/**
 * Coerce a string from the input field to the right scalar type. Numeric
 * strings become numbers; "true"/"false" become booleans; everything else
 * stays a string. The server-side filterIndex handles type-aware
 * comparison so this just opens up the common ergonomic cases.
 */
function coerceValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && trimmed !== '') return asNumber;
  if (trimmed.toLowerCase() === 'true') return true;
  if (trimmed.toLowerCase() === 'false') return false;
  return trimmed;
}

export function buildColumnFilter(rules: ReadonlyArray<FilterRule>): FilterModel {
  const valid = rules.filter((r) => isUnaryOp(r.op) || r.value !== '');
  if (valid.length === 0) return null;

  const comparisons = valid.map((rule) => {
    if (isUnaryOp(rule.op)) {
      return {
        type: 'comparison' as const,
        columnId: rule.columnId,
        op: rule.op,
      };
    }
    return {
      type: 'comparison' as const,
      columnId: rule.columnId,
      op: rule.op,
      value: coerceValue(rule.value),
      caseSensitive: false,
    };
  });

  if (comparisons.length === 1) return comparisons[0]!;
  return {
    type: 'logical',
    op: 'and',
    filters: comparisons,
  };
}

let nextFilterRuleId = 1;
export function newFilterRule(columnId: string): FilterRule {
  return {
    id: `r${String(nextFilterRuleId++)}`,
    columnId,
    op: 'contains',
    value: '',
  };
}
