/**
 * Tree playground mode — hierarchical regions → countries → cities
 * dataset rendered through @onegrid/data's flattenTree + the core
 * RowTreeMeta path.
 *
 * Top two levels (regions, countries) are populated synchronously.
 * Leaf cities are wired with `loadChildren` set to `undefined` (no
 * deeper level) BUT one country has a deferred `loadChildren` to
 * demonstrate the lazy-load path: clicking it triggers an async
 * fetch + state update.
 */

import { flattenTree, type FlatTreeEntry, type TreeNode } from '@onegrid/data';
import type { ColumnDef, RowSource } from '@onegrid/react';

export interface TreeRow {
  readonly name: string;
  readonly population: number | null;
  readonly type: 'region' | 'country' | 'city';
}

export const TREE_COLUMNS: ReadonlyArray<ColumnDef> = [
  {
    id: 'name',
    width: 320,
    displayName: 'Name',
    format: (v) => String(v ?? ''),
  },
  {
    id: 'type',
    width: 100,
    displayName: 'Kind',
    format: (v) => String(v ?? ''),
    color: (v) =>
      v === 'region' ? '#62d68a' : v === 'country' ? '#6ea8fe' : '#a5b1c2',
  },
  {
    id: 'population',
    width: 140,
    displayName: 'Population',
    format: (v) => (typeof v === 'number' ? v.toLocaleString() : '—'),
  },
];

const SEED: TreeNode<TreeRow>[] = [
  {
    id: 'emea',
    data: { name: 'EMEA', type: 'region', population: 750_000_000 },
    children: [
      {
        id: 'emea.de',
        data: { name: 'Germany', type: 'country', population: 83_200_000 },
        children: [
          { id: 'emea.de.berlin', data: { name: 'Berlin', type: 'city', population: 3_700_000 } },
          { id: 'emea.de.munich', data: { name: 'Munich', type: 'city', population: 1_500_000 } },
          { id: 'emea.de.hamburg', data: { name: 'Hamburg', type: 'city', population: 1_900_000 } },
        ],
      },
      {
        id: 'emea.fr',
        data: { name: 'France', type: 'country', population: 67_700_000 },
        children: [
          { id: 'emea.fr.paris', data: { name: 'Paris', type: 'city', population: 2_140_000 } },
          { id: 'emea.fr.lyon', data: { name: 'Lyon', type: 'city', population: 520_000 } },
        ],
      },
    ],
  },
  {
    id: 'amer',
    data: { name: 'Americas', type: 'region', population: 1_010_000_000 },
    children: [
      {
        id: 'amer.us',
        data: { name: 'United States', type: 'country', population: 333_000_000 },
        children: [
          { id: 'amer.us.nyc', data: { name: 'New York', type: 'city', population: 8_400_000 } },
          { id: 'amer.us.la', data: { name: 'Los Angeles', type: 'city', population: 3_900_000 } },
          { id: 'amer.us.chi', data: { name: 'Chicago', type: 'city', population: 2_700_000 } },
        ],
      },
      {
        id: 'amer.br',
        data: { name: 'Brazil', type: 'country', population: 215_000_000 },
        // Lazy-load demonstration: cities arrive on first expand.
        loadChildren: async () => {
          await new Promise((r) => setTimeout(r, 600));
          return [
            { id: 'amer.br.sp', data: { name: 'São Paulo', type: 'city' as const, population: 12_300_000 } },
            { id: 'amer.br.rj', data: { name: 'Rio de Janeiro', type: 'city' as const, population: 6_700_000 } },
          ];
        },
      },
    ],
  },
  {
    id: 'apac',
    data: { name: 'APAC', type: 'region', population: 4_700_000_000 },
    children: [
      {
        id: 'apac.jp',
        data: { name: 'Japan', type: 'country', population: 125_500_000 },
        children: [
          { id: 'apac.jp.tokyo', data: { name: 'Tokyo', type: 'city', population: 13_960_000 } },
          { id: 'apac.jp.osaka', data: { name: 'Osaka', type: 'city', population: 2_750_000 } },
        ],
      },
    ],
  },
];

export interface TreeModeHandle {
  readonly columns: ReadonlyArray<ColumnDef>;
  /** Refreshed on every state change — useOneGrid's rowSource ref
   *  identity check uses this, so a new object each toggle is what
   *  triggers grid.setRowSource. */
  readonly rowSource: RowSource;
  readonly flat: ReadonlyArray<FlatTreeEntry<TreeRow>>;
  readonly toggle: (id: string) => Promise<void>;
  readonly openIds: ReadonlySet<string>;
}

function buildRowSource(flat: ReadonlyArray<FlatTreeEntry<TreeRow>>): RowSource {
  return {
    numRows: flat.length,
    getCell: (rowIndex, columnId) => {
      const entry = flat[rowIndex];
      if (!entry) return null;
      const data = entry.data as unknown as Record<string, unknown>;
      return data[columnId] ?? null;
    },
  };
}

/** Build a tree-mode handle. The caller supplies a tick callback the
 *  handle invokes on every state change so the React adapter can
 *  re-render. */
export function createTreeMode(onChange: () => void): TreeModeHandle {
  let nodes: TreeNode<TreeRow>[] = SEED;
  let openIds: Set<string> = new Set();
  let flat: FlatTreeEntry<TreeRow>[] = flattenTree(nodes, openIds);
  let rowSource: RowSource = buildRowSource(flat);

  const recompute = (): void => {
    flat = flattenTree(nodes, openIds);
    rowSource = buildRowSource(flat);
    onChange();
  };

  const toggle = async (id: string): Promise<void> => {
    if (openIds.has(id)) {
      openIds = new Set(openIds);
      openIds.delete(id);
      recompute();
      return;
    }
    const node = findNode(nodes, id);
    if (node && !node.children && node.loadChildren) {
      const children = await node.loadChildren();
      const { loadChildren: _omit, ...rest } = node;
      nodes = replaceNode(nodes, id, { ...rest, children });
    }
    openIds = new Set(openIds);
    openIds.add(id);
    recompute();
  };

  return {
    columns: TREE_COLUMNS,
    get flat() { return flat; },
    get openIds() { return openIds; },
    get rowSource() { return rowSource; },
    toggle,
  };
}

function findNode(
  nodes: ReadonlyArray<TreeNode<TreeRow>>,
  id: string,
): TreeNode<TreeRow> | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function replaceNode(
  nodes: ReadonlyArray<TreeNode<TreeRow>>,
  id: string,
  next: TreeNode<TreeRow>,
): TreeNode<TreeRow>[] {
  return nodes.map((n) => {
    if (n.id === id) return next;
    if (n.children) {
      return { ...n, children: replaceNode(n.children, id, next) };
    }
    return n;
  });
}
