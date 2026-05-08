// =============================================================================
// TanStack-Table-style ColumnDef → oneGrid ColumnDef transformer.
//
// TanStack Table is headless — its "columns" carry only data shape
// + render slots; layout (size, pinning) lives at the consumer's
// table component. The translation is shallower than AG-Grid as a
// result, but a few common props rename cleanly.
//
// CLEAN-ROOM RULE: every entry in PROP_RENAMES below has a SOURCE
// comment pointing at a publicly-readable description.
// =============================================================================

import jscodeshift from 'jscodeshift';
import type { TransformResult } from '../index';

const PROP_RENAMES: Record<string, string> = {
  // SOURCE: https://tanstack.com/table/latest/docs/guide/column-defs
  accessorKey: 'id',
  // SOURCE: https://tanstack.com/table/latest/docs/guide/column-defs
  header: 'displayName',
  // SOURCE: https://tanstack.com/table/latest/docs/guide/column-sizing
  size: 'width',
  // SOURCE: https://tanstack.com/table/latest/docs/guide/column-sizing
  minSize: 'minWidth',
  // SOURCE: https://tanstack.com/table/latest/docs/guide/column-sizing
  maxSize: 'maxWidth',
  // SOURCE: https://tanstack.com/table/latest/docs/guide/cells
  cell: 'renderer',
};

const AMBIGUOUS_PROPS: Record<string, string> = {
  accessorFn:
    'accessorFn: oneGrid reads cells through RowSource.getCell(row, columnId), not per-column accessor — refactor data layer',
  enableSorting:
    'enableSorting: oneGrid sort is global (GridOptions.sortable / setSort) — translate at grid level',
  enableFiltering:
    'enableFiltering: oneGrid filter lives in @onegrid/data FilterModel — translate at grid level',
  meta: 'meta: oneGrid does not have a per-column meta bag; use a separate Map keyed by column id',
};

export function transform(input: string): TransformResult {
  const j = jscodeshift.withParser('tsx');
  const root = j(input);
  const todos: TransformResult['todos'][number][] = [];

  root
    .find(j.ObjectExpression)
    .filter((path) =>
      path.value.properties.some((p) => {
        if (p.type !== 'Property' && p.type !== 'ObjectProperty') return false;
        const key = (p as { key: { name?: string } }).key;
        return key.name === 'accessorKey' || key.name === 'accessorFn';
      }),
    )
    .forEach((path) => {
      rewriteObject(j, path.value, todos);
    });

  return {
    output: root.toSource({ quote: 'single', trailingComma: true }),
    todos,
  };
}

function rewriteObject(
  j: jscodeshift.JSCodeshift,
  obj: jscodeshift.ObjectExpression,
  todos: TransformResult['todos'][number][],
): void {
  const remaining: jscodeshift.ObjectExpression['properties'] = [];
  for (const prop of obj.properties) {
    if (prop.type !== 'Property' && prop.type !== 'ObjectProperty') {
      remaining.push(prop);
      continue;
    }
    const key = (prop as { key: { name?: string; type?: string } }).key;
    if (key.type !== 'Identifier' || !key.name) {
      remaining.push(prop);
      continue;
    }
    const name = key.name;
    type PropValue = Parameters<typeof j.property>[2];
    if (name in PROP_RENAMES) {
      const renamed = j.property(
        'init',
        j.identifier(PROP_RENAMES[name]!),
        (prop as { value: PropValue }).value,
      );
      remaining.push(renamed as jscodeshift.ObjectExpression['properties'][number]);
      continue;
    }
    if (name in AMBIGUOUS_PROPS) {
      const line = prop.loc?.start.line ?? 0;
      todos.push({ line, message: AMBIGUOUS_PROPS[name]! });
      const flagged = j.property(
        'init',
        j.identifier(name),
        (prop as { value: PropValue }).value,
      );
      flagged.comments = [
        j.commentLine(` TODO(@onegrid/migrate): ${AMBIGUOUS_PROPS[name]!}`, true, false),
      ];
      remaining.push(flagged as jscodeshift.ObjectExpression['properties'][number]);
      continue;
    }
    remaining.push(prop);
  }
  obj.properties = remaining;
}
