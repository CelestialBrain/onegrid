// =============================================================================
// IncrementalFormulaEngine
//
// Adapton-style demand-driven recompute layered over the existing eager
// parser + evaluator. Compared to the stateless `createFormulaEngine()`,
// this version:
//
//   - Stores formulas + cached values per cell so reads are O(1) when clean.
//   - Tracks dependencies via a DependencyGraph populated as a side-effect
//     of evaluation (the resolver records every cell/range it reads).
//   - Marks cells dirty *transitively* on every value or formula change,
//     but only *recomputes* the subset that's actually read (demand-driven).
//   - Models ranges as first-class graph nodes so 1000 formulas reading
//     A1:A100 produce 100+1000 edges, not 100·1000.
//   - Detects cycles cheaply via the demand stack: if evaluation tries to
//     re-enter a cell already on the stack, the inner reference resolves
//     to #REF! and the outer evaluation completes without infinite recursion.
//
// Limitations (v0.0.5):
//   - Linear range decomposition (sharing work across overlapping aggregates
//     by splitting A1:A100 into A1:A99 + A100) is not implemented. Each
//     distinct range gets its own node.
//   - Range expansion is eager: A1:Z1000 will allocate 26000 entries.
//     Caller-side guard recommended for unbounded ranges.
//
// =============================================================================

import { evaluate as evaluateAst } from './evaluator';
import type { CellResolver } from './evaluator';
import type { FormulaNode } from './ast';
import { parseFormula } from './parser';
import { DependencyGraph } from './dependency-graph';
import { expandRange, isRangeId, normalizeCellRef, normalizeRangeRef } from './range';
import { REF_ERROR, isFormulaError } from './errors';

export interface EngineStats {
  readonly cellCount: number;
  readonly formulaCount: number;
  readonly dirtyCount: number;
  readonly rangeNodeCount: number;
  readonly edgeCount: number;
  readonly nodeCount: number;
}

export interface IncrementalFormulaEngine {
  /** Set a cell's formula. Source is the formula text (`=A1+B1` or `=SUM(A1:A10)`). */
  readonly setCell: (id: string, source: string) => void;
  /** Set a literal value (no formula). Triggers dirty propagation to dependents. */
  readonly setValue: (id: string, value: unknown) => void;
  /** Read a cell's value. Recomputes if dirty; returns the cached value otherwise. */
  readonly getValue: (id: string) => unknown;
  /** Forget a cell entirely. Dependents become dirty (and their reads of this id resolve to undefined). */
  readonly clearCell: (id: string) => void;
  /** True if `id` has either a value or a formula stored. */
  readonly hasCell: (id: string) => boolean;
  /** Direct dependencies of `id`. Useful for debugging / introspection tools. */
  readonly getDependencies: (id: string) => ReadonlyArray<string>;
  /** Direct dependents of `id`. */
  readonly getDependents: (id: string) => ReadonlyArray<string>;
  /** Read-only snapshot of engine state for tests / telemetry. */
  readonly getStats: () => EngineStats;
  /** Drop all cells, formulas, caches, and edges. */
  readonly clear: () => void;
}

export function createIncrementalEngine(): IncrementalFormulaEngine {
  const cellAsts = new Map<string, FormulaNode>();
  const cellSources = new Map<string, string>();
  const cellValues = new Map<string, unknown>();
  const rangeValues = new Map<string, ReadonlyArray<unknown>>();
  const dirty = new Set<string>();
  const graph = new DependencyGraph();
  const demandStack: string[] = [];

  function markDirtyTransitively(id: string): void {
    const reachable = graph.collectTransitiveDependents(id);
    for (const node of reachable) {
      dirty.add(node);
      if (isRangeId(node)) rangeValues.delete(node);
    }
  }

  function setCell(id: string, source: string): void {
    const cellId = normalizeCellRef(id);
    const ast = parseFormula(source);
    cellSources.set(cellId, source);
    cellAsts.set(cellId, ast);
    cellValues.delete(cellId);
    // Old outgoing edges are stale; clear them now and let evaluation rebuild.
    graph.clearOutgoing(cellId);
    markDirtyTransitively(cellId);
  }

  function setValue(id: string, value: unknown): void {
    const cellId = normalizeCellRef(id);
    cellAsts.delete(cellId);
    cellSources.delete(cellId);
    cellValues.set(cellId, value);
    // Literal values never have outgoing dependencies; clear any leftovers.
    graph.clearOutgoing(cellId);
    markDirtyTransitively(cellId);
    // Self isn't dirty — its value is what we just set.
    dirty.delete(cellId);
  }

  function clearCell(id: string): void {
    const cellId = normalizeCellRef(id);
    cellAsts.delete(cellId);
    cellSources.delete(cellId);
    cellValues.delete(cellId);
    markDirtyTransitively(cellId);
    graph.removeNode(cellId);
    dirty.delete(cellId);
  }

  function hasCell(id: string): boolean {
    const cellId = normalizeCellRef(id);
    return cellAsts.has(cellId) || cellValues.has(cellId);
  }

  function getValue(id: string): unknown {
    const cellId = normalizeCellRef(id);
    return computeCell(cellId);
  }

  function computeCell(cellId: string): unknown {
    if (demandStack.includes(cellId)) {
      // We're being read while already evaluating — cycle. The inner
      // reference returns #REF! so the outer evaluation can finish.
      return REF_ERROR;
    }

    const ast = cellAsts.get(cellId);

    // Literal-value cell: return whatever was stored. Never dirty (its
    // value is whatever setValue wrote).
    if (!ast) {
      if (cellValues.has(cellId)) return cellValues.get(cellId);
      return null;
    }

    // Formula cell, clean & cached → return memoized value.
    if (!dirty.has(cellId) && cellValues.has(cellId)) {
      return cellValues.get(cellId);
    }

    // Recompute. Clear outgoing edges first so the resolver can rebuild
    // them as side effects of evaluation.
    graph.clearOutgoing(cellId);
    demandStack.push(cellId);
    try {
      const value = evaluateAst(ast, makeResolver(cellId));
      cellValues.set(cellId, value);
      dirty.delete(cellId);
      return value;
    } finally {
      demandStack.pop();
    }
  }

  function computeRange(rangeId: string): ReadonlyArray<unknown> {
    if (demandStack.includes(rangeId)) {
      return [REF_ERROR];
    }

    if (!dirty.has(rangeId) && rangeValues.has(rangeId)) {
      return rangeValues.get(rangeId)!;
    }

    let cells: string[];
    try {
      cells = expandRange(rangeId);
    } catch {
      return [REF_ERROR];
    }

    graph.clearOutgoing(rangeId);
    demandStack.push(rangeId);
    try {
      const values: unknown[] = [];
      for (const cellId of cells) {
        graph.addEdge(rangeId, cellId);
        values.push(computeCell(cellId));
      }
      rangeValues.set(rangeId, values);
      dirty.delete(rangeId);
      return values;
    } finally {
      demandStack.pop();
    }
  }

  function makeResolver(currentCellId: string): CellResolver {
    return {
      getCell: (ref: string) => {
        const targetId = normalizeCellRef(ref);
        graph.addEdge(currentCellId, targetId);
        const value = computeCell(targetId);
        // Cycles inside a range produce a sentinel; surface them as errors.
        return isFormulaError(value) ? value : value;
      },
      getRange: (ref: string) => {
        const rangeId = normalizeRangeRef(ref);
        graph.addEdge(currentCellId, rangeId);
        return computeRange(rangeId);
      },
    };
  }

  function getStats(): EngineStats {
    let rangeNodes = 0;
    for (const k of [...rangeValues.keys()]) {
      if (isRangeId(k)) rangeNodes += 1;
    }
    return {
      cellCount: cellAsts.size + cellValues.size,
      formulaCount: cellAsts.size,
      dirtyCount: dirty.size,
      rangeNodeCount: rangeNodes,
      edgeCount: graph.edgeCount,
      nodeCount: graph.nodeCount,
    };
  }

  function clear(): void {
    cellAsts.clear();
    cellSources.clear();
    cellValues.clear();
    rangeValues.clear();
    dirty.clear();
    graph.clear();
    demandStack.length = 0;
  }

  return {
    setCell,
    setValue,
    getValue,
    clearCell,
    hasCell,
    getDependencies: (id) => [...graph.getDependencies(normalizeCellRef(id))],
    getDependents: (id) => [...graph.getDependents(normalizeCellRef(id))],
    getStats,
    clear,
  };
}
