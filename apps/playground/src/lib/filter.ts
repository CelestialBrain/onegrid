/**
 * Quick-filter helpers: the user types one query in the toolbar and we
 * fan it out as a case-insensitive `contains` filter ORed across the
 * given columns. AG Grid calls the equivalent feature "Quick Filter".
 *
 * For column-specific filters with proper operator pickers, see the
 * forthcoming Filter Builder UI (per-column popover in v0.0.5).
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
