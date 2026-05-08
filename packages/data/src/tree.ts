// =============================================================================
// Hierarchical tree data — caller-supplied tree, flattened to a linear
// render order respecting an `openIds` expansion set.
//
// Same shape as flattenGroupTree (which handles aggregation-driven
// grouping) but for data-driven hierarchy: the caller already knows
// the parent→child relationships, so the grid just needs to render
// the open subtree with chevrons + indent.
//
// Lazy-load support: a node may carry `loadChildren` instead of (or
// alongside) a static `children` array. The grid never calls the
// loader directly — the caller decides when to fetch by listening for
// `onToggleGroup` (with the node id as the path) and updating its
// own state. This keeps the data layer pure-sync.
// =============================================================================

export interface TreeNode<T = unknown> {
  readonly id: string;
  readonly data: T;
  readonly children?: ReadonlyArray<TreeNode<T>>;
  /** Lazy loader. When the caller hasn't yet populated `children`,
   *  setting this signals that children CAN be fetched — the chevron
   *  shows expanded-empty in the meantime. The grid does not invoke
   *  the loader; the caller handles it on toggle. */
  readonly loadChildren?: () => Promise<ReadonlyArray<TreeNode<T>>>;
}

export interface FlatTreeEntry<T = unknown> {
  readonly id: string;
  readonly depth: number;
  readonly data: T;
  /** True if no children AND no loader. */
  readonly isLeaf: boolean;
  /** True if children.length > 0 OR a loader exists. */
  readonly hasChildren: boolean;
  /** Reflects openIds membership at flatten time. */
  readonly expanded: boolean;
}

/**
 * Flatten the open subset of a forest to a render-ordered list. Each
 * entry's `depth` matches its level in the tree (top-level = 0).
 * Closed subtrees emit one entry (the parent); open subtrees emit the
 * parent followed by recursive descendants.
 */
export function flattenTree<T>(
  roots: ReadonlyArray<TreeNode<T>>,
  openIds: ReadonlySet<string>,
): FlatTreeEntry<T>[] {
  const out: FlatTreeEntry<T>[] = [];
  for (const root of roots) walk(root, 0);
  return out;

  function walk(node: TreeNode<T>, depth: number): void {
    const hasChildren = (node.children && node.children.length > 0) || !!node.loadChildren;
    const expanded = openIds.has(node.id);
    out.push({
      id: node.id,
      depth,
      data: node.data,
      isLeaf: !hasChildren,
      hasChildren,
      expanded,
    });
    if (expanded && node.children) {
      for (const child of node.children) walk(child, depth + 1);
    }
  }
}

/** Recursively count nodes in a forest (open + closed). Useful for
 *  computing aria-rowcount when the caller wants to advertise the
 *  full tree depth even when some branches are closed. */
export function countTreeNodes<T>(roots: ReadonlyArray<TreeNode<T>>): number {
  let n = 0;
  for (const root of roots) n += visit(root);
  return n;

  function visit(node: TreeNode<T>): number {
    let count = 1;
    if (node.children) for (const c of node.children) count += visit(c);
    return count;
  }
}
