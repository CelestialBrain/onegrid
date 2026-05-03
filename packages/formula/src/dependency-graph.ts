// =============================================================================
// DependencyGraph
//
// Tracks "X depends on Y" relationships for the incremental formula engine.
// Stores both directions:
//
//   dependencies(X) — what X reads (X's outgoing edges)
//   dependents(X)   — who reads X (X's incoming edges)
//
// Both views matter:
//   - Replacing X's formula needs to clear X's outgoing edges (it reads
//     different cells now); we walk dependencies(X) and remove X from each
//     target's dependents set.
//   - Marking X dirty propagates through dependents (transitive closure
//     via BFS).
//
// Cycle detection is performed lazily by the engine via the demand stack —
// no explicit Tarjan SCC needed for this v1. If we ever need batch
// detection (e.g. for static analysis), add it as a separate pass.
//
// All node IDs are opaque strings. Cell IDs ("A1") and range IDs ("A1:A10")
// share the same namespace — collisions are impossible because ranges
// always contain ":".
// =============================================================================

export class DependencyGraph {
  /** node → set of nodes IT depends on (its reads). */
  private readonly dependencies = new Map<string, Set<string>>();
  /** node → set of nodes that DEPEND ON it (consumers). */
  private readonly dependents = new Map<string, Set<string>>();

  /** Record that `from` reads `to`. Idempotent. */
  addEdge(from: string, to: string): void {
    if (from === to) {
      // Self-edges are harmless to record but add noise; skip.
      return;
    }
    let outgoing = this.dependencies.get(from);
    if (!outgoing) {
      outgoing = new Set();
      this.dependencies.set(from, outgoing);
    }
    outgoing.add(to);

    let incoming = this.dependents.get(to);
    if (!incoming) {
      incoming = new Set();
      this.dependents.set(to, incoming);
    }
    incoming.add(from);
  }

  /**
   * Drop every edge originating from `from` (i.e. every cell `from`
   * currently reads). Used before re-evaluation: the engine clears the
   * old read-set so the new evaluation can record the current one cleanly.
   */
  clearOutgoing(from: string): void {
    const outgoing = this.dependencies.get(from);
    if (!outgoing) return;
    for (const to of outgoing) {
      const incoming = this.dependents.get(to);
      if (incoming) {
        incoming.delete(from);
        if (incoming.size === 0) this.dependents.delete(to);
      }
    }
    this.dependencies.delete(from);
  }

  /**
   * Forget the node entirely. Drops both directions of every edge it
   * participates in. Used when a cell is cleared.
   */
  removeNode(id: string): void {
    this.clearOutgoing(id);
    const incoming = this.dependents.get(id);
    if (incoming) {
      for (const consumer of incoming) {
        const out = this.dependencies.get(consumer);
        if (out) {
          out.delete(id);
          if (out.size === 0) this.dependencies.delete(consumer);
        }
      }
      this.dependents.delete(id);
    }
  }

  /** Direct (one-hop) dependencies of `id`. Empty set if none. */
  getDependencies(id: string): ReadonlySet<string> {
    return this.dependencies.get(id) ?? EMPTY_SET;
  }

  /** Direct (one-hop) dependents of `id`. Empty set if none. */
  getDependents(id: string): ReadonlySet<string> {
    return this.dependents.get(id) ?? EMPTY_SET;
  }

  /**
   * Every node transitively reachable through `dependents` from `id`,
   * including `id` itself. BFS in O(reachable). Used for dirty
   * propagation when a cell value changes.
   */
  collectTransitiveDependents(id: string): Set<string> {
    const result = new Set<string>([id]);
    const queue: string[] = [id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const next = this.dependents.get(cur);
      if (!next) continue;
      for (const node of next) {
        if (!result.has(node)) {
          result.add(node);
          queue.push(node);
        }
      }
    }
    return result;
  }

  /** Total node count. Cells with no edges in either direction don't count. */
  get nodeCount(): number {
    const ids = new Set<string>();
    for (const k of this.dependencies.keys()) ids.add(k);
    for (const k of this.dependents.keys()) ids.add(k);
    return ids.size;
  }

  /** Total edge count (each edge counted once). */
  get edgeCount(): number {
    let n = 0;
    for (const out of this.dependencies.values()) n += out.size;
    return n;
  }

  /** Drop every edge. The graph is empty afterward. */
  clear(): void {
    this.dependencies.clear();
    this.dependents.clear();
  }
}

const EMPTY_SET: ReadonlySet<string> = new Set();
