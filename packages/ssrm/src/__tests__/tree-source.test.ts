// =============================================================================
// SsrmTreeSource — unit tests
//
// Each test wires a fake DataSource backed by an in-memory tree, so the
// flow exercises:
//   1. Initial root fetch on construct
//   2. Toggle → children fetch → flat view grows
//   3. Subsequent collapse keeps children cached (no second fetch)
//   4. Distinct fingerprints per parentId (verified via the request stream)
// =============================================================================

import { describe, expect, it, vi } from 'vitest';
import type {
  BlockRequest,
  BlockResponse,
  DataSource,
  HierarchyEntry,
  Schema,
} from '@onegrid/protocol';
import { createSsrmTreeSource } from '../tree-source';

const SCHEMA: Schema = [
  { id: 'id', type: 'utf8' },
  { id: 'name', type: 'utf8' },
];

interface Node {
  id: string;
  name: string;
  children?: Node[];
}

const TREE: Node[] = [
  {
    id: 'A',
    name: 'Alpha',
    children: [
      { id: 'A1', name: 'Alpha-1' },
      { id: 'A2', name: 'Alpha-2', children: [{ id: 'A2a', name: 'Alpha-2-a' }] },
    ],
  },
  { id: 'B', name: 'Beta' },
];

function findChildren(parentId: string | null): Node[] {
  if (parentId === null) return TREE;
  function walk(nodes: Node[]): Node[] | null {
    for (const n of nodes) {
      if (n.id === parentId) return n.children ?? [];
      if (n.children) {
        const found = walk(n.children);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(TREE) ?? [];
}

function makeFakeSource(): DataSource & {
  requests: BlockRequest[];
} {
  const requests: BlockRequest[] = [];
  const fetchBlock = async (req: BlockRequest): Promise<BlockResponse> => {
    requests.push(req);
    const children = findChildren(req.parentId ?? null);
    const rows = children.map((c) => ({ id: c.id, name: c.name }));
    const hierarchy: HierarchyEntry[] = children.map((c) => ({
      id: c.id,
      hasChildren: !!c.children && c.children.length > 0,
    }));
    return {
      encoding: 'json',
      rows,
      hierarchy,
      nextCursor: null,
      prevCursor: null,
      totalRowCount: rows.length,
    };
  };
  return {
    schema: () => SCHEMA,
    fetchBlock,
    requests,
  };
}

async function flush(): Promise<void> {
  // Two microtask ticks is enough for the inflight then-chain to settle.
  await Promise.resolve();
  await Promise.resolve();
}

describe('createSsrmTreeSource', () => {
  it('fetches roots on construct and exposes them as flat rows', async () => {
    const ds = makeFakeSource();
    const onUpdate = vi.fn();
    const tree = createSsrmTreeSource(ds, { onUpdate });

    expect(tree.numRows).toBe(0);
    await flush();

    expect(tree.numRows).toBe(2);
    expect(tree.getCell(0, 'name')).toBe('Alpha');
    expect(tree.getCell(1, 'name')).toBe('Beta');
    expect(tree.getRowMeta(0)).toMatchObject({
      depth: 0,
      id: 'A',
      hasChildren: true,
      isLeaf: false,
      expanded: false,
    });
    expect(onUpdate).toHaveBeenCalled();
  });

  it('toggle fetches children and grows the flat view', async () => {
    const ds = makeFakeSource();
    const tree = createSsrmTreeSource(ds);
    await flush();

    tree.toggle('A');
    // Synchronously the row count is unchanged — children haven't landed.
    // After flushing the fetch promise we should see depth-1 children.
    await flush();

    expect(tree.numRows).toBe(4); // A, A1, A2, B
    expect(tree.getRowMeta(0)?.expanded).toBe(true);
    expect(tree.getRowMeta(1)?.depth).toBe(1);
    expect(tree.getCell(1, 'name')).toBe('Alpha-1');
    expect(tree.getCell(2, 'name')).toBe('Alpha-2');
  });

  it('opening a leaf parent with no children is a no-op', async () => {
    const ds = makeFakeSource();
    const tree = createSsrmTreeSource(ds);
    await flush();

    tree.toggle('B'); // B has no children — `hasChildren: false`
    await flush();
    // Even though the toggle ran, fetchBlock for parentId='B' returns []
    // and the flat view stays at 2.
    expect(tree.numRows).toBe(2);
    expect(tree.getRowMeta(1)?.expanded).toBe(true);
    expect(tree.getRowMeta(1)?.hasChildren).toBe(false);
  });

  it('collapsing keeps cache (no second fetch on re-open)', async () => {
    const ds = makeFakeSource();
    const tree = createSsrmTreeSource(ds);
    await flush();
    tree.toggle('A');
    await flush();
    const fetchCountAfterFirstOpen = ds.requests.length;

    tree.toggle('A'); // collapse
    expect(tree.numRows).toBe(2);
    tree.toggle('A'); // re-open
    await flush();
    expect(tree.numRows).toBe(4);
    // No new fetch — children are cached under id 'A'.
    expect(ds.requests.length).toBe(fetchCountAfterFirstOpen);
  });

  it('nested expansion cascades through depth', async () => {
    const ds = makeFakeSource();
    const tree = createSsrmTreeSource(ds);
    await flush();
    tree.toggle('A');
    await flush();
    tree.toggle('A2'); // depth-1 → fetch its children
    await flush();

    expect(tree.numRows).toBe(5); // A, A1, A2, A2a, B
    expect(tree.getRowMeta(3)?.depth).toBe(2);
    expect(tree.getCell(3, 'name')).toBe('Alpha-2-a');
  });

  it('uses parentId in the wire request so the server can scope', async () => {
    const ds = makeFakeSource();
    const tree = createSsrmTreeSource(ds);
    await flush();
    tree.toggle('A');
    await flush();

    expect(ds.requests[0]?.parentId).toBeNull(); // root request
    expect(ds.requests[1]?.parentId).toBe('A');
  });

  it('invalidate forces a re-fetch on next toggle', async () => {
    const ds = makeFakeSource();
    const tree = createSsrmTreeSource(ds);
    await flush();
    tree.toggle('A');
    await flush();
    const before = ds.requests.length;
    tree.invalidate('A');
    tree.toggle('A'); // collapse first (we're still open, so close)
    tree.toggle('A'); // re-open → triggers fetch since cache is gone
    await flush();
    expect(ds.requests.length).toBeGreaterThan(before);
  });
});
