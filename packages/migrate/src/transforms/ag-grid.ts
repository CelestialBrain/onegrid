// =============================================================================
// AG-Grid-style ColDef → oneGrid ColumnDef transformer.
//
// Operates on object literals that look like AG-Grid column definitions
// and rewrites the property names + adds TODO comments for translations
// that the codemod can't resolve mechanically.
//
// CLEAN-ROOM RULE
// ---------------
// Every entry in PROP_RENAMES must include a SOURCE comment pointing
// at a publicly-readable description of the property. Do NOT add
// entries by reading commercial source code or non-public docs.
// =============================================================================
import jscodeshift, { type Collection } from 'jscodeshift';
import type { TransformResult } from '../index';

/**
 * 1:1 prop renames. Each entry maps an AG-Grid ColDef property name to
 * the equivalent oneGrid ColumnDef name. SOURCE links go to the
 * public AG-Grid feature page that describes the property.
 */
const PROP_RENAMES: Record<string, string> = {
  // SOURCE: https://www.ag-grid.com/javascript-data-grid/column-definitions/
  field: 'id',
  // SOURCE: https://www.ag-grid.com/javascript-data-grid/column-definitions/
  headerName: 'displayName',
  // SOURCE: https://www.ag-grid.com/javascript-data-grid/column-sizing/
  width: 'width',
  // SOURCE: https://www.ag-grid.com/javascript-data-grid/column-sizing/
  minWidth: 'minWidth',
  // SOURCE: https://www.ag-grid.com/javascript-data-grid/column-sizing/
  maxWidth: 'maxWidth',
  // SOURCE: https://www.ag-grid.com/javascript-data-grid/cell-rendering/
  cellRenderer: 'renderer',
  // SOURCE: https://www.ag-grid.com/javascript-data-grid/cell-editing/
  cellEditor: 'editor',
  // SOURCE: https://www.ag-grid.com/javascript-data-grid/component-tooltip/
  tooltipValueGetter: 'tooltip',
  // SOURCE: https://www.ag-grid.com/javascript-data-grid/value-formatters/
  valueFormatter: 'format',
};

/**
 * Properties that need a heads-up comment because the semantic
 * translation isn't 1:1 — the developer should review.
 */
const AMBIGUOUS_PROPS: Record<string, string> = {
  pinned: 'pinned: oneGrid uses ColumnDef.pinned ("left"|"right"); AG-Grid accepts boolean — review value',
  cellStyle: 'cellStyle: oneGrid uses color() / background() callbacks instead of an inline style object — split manually',
  cellClass: 'cellClass: no direct equivalent; consider color()/background() or a custom renderer',
  filter: 'filter: oneGrid filters live at the data layer (FilterModel), not on ColumnDef — wire via @onegrid/data',
  editable: 'editable: oneGrid uses GridOptions.editable (boolean | predicate) at the grid level, not per-column',
  sortable: 'sortable: oneGrid sort is opt-out at the grid level via GridOptions.sortable, not per-column',
  rowGroup: 'rowGroup: oneGrid grouping is built via @onegrid/data groupRows(table, columns) — see ROADMAP §3',
  pivot: 'pivot: oneGrid pivot is built via @onegrid/data pivot(table, model) — see Pivot mode in playground',
};

export function transform(input: string): TransformResult {
  const j = jscodeshift.withParser('tsx');
  const root = j(input);
  const todos: TransformResult['todos'][number][] = [];

  // Find object literals that look like ColDefs: object expressions
  // with at least one of `field` or `headerName`. Tighter heuristics
  // avoid touching unrelated objects in user code.
  root
    .find(j.ObjectExpression)
    .filter((path) => {
      return path.value.properties.some((p) => {
        if (p.type !== 'Property' && p.type !== 'ObjectProperty') return false;
        const key = (p as { key: { name?: string } }).key;
        return key.name === 'field' || key.name === 'headerName';
      });
    })
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
  const remainingProps: jscodeshift.ObjectExpression['properties'] = [];
  for (const prop of obj.properties) {
    if (prop.type !== 'Property' && prop.type !== 'ObjectProperty') {
      // Spread, computed key, etc. — leave it and emit a TODO.
      const line = prop.loc?.start.line ?? 0;
      todos.push({
        line,
        message: 'spread or computed property in ColDef — codemod cannot rewrite, review manually',
      });
      remainingProps.push(prop);
      continue;
    }
    const key = (prop as { key: { name?: string; type?: string } }).key;
    if (key.type !== 'Identifier' || !key.name) {
      remainingProps.push(prop);
      continue;
    }

    const name = key.name;
    type PropValue = Parameters<typeof j.property>[2];

    // 1:1 rename.
    if (name in PROP_RENAMES) {
      const renamed = j.property(
        'init',
        j.identifier(PROP_RENAMES[name]!),
        (prop as { value: PropValue }).value,
      );
      remainingProps.push(renamed as jscodeshift.ObjectExpression['properties'][number]);
      continue;
    }

    // Ambiguous — keep but flag.
    if (name in AMBIGUOUS_PROPS) {
      const line = prop.loc?.start.line ?? 0;
      todos.push({ line, message: AMBIGUOUS_PROPS[name]! });
      const flagged = j.property(
        'init',
        j.identifier(name),
        (prop as { value: PropValue }).value,
      );
      // Attach a leading-line comment on the property.
      flagged.comments = [
        j.commentLine(` TODO(@onegrid/migrate): ${AMBIGUOUS_PROPS[name]!}`, true, false),
      ];
      remainingProps.push(flagged as jscodeshift.ObjectExpression['properties'][number]);
      continue;
    }

    // Unknown property — leave it untouched.
    remainingProps.push(prop);
  }
  obj.properties = remainingProps;
}
