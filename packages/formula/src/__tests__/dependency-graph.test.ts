import { describe, expect, it } from 'vitest';
import { DependencyGraph } from '../dependency-graph';

describe('DependencyGraph', () => {
  it('records edges in both directions', () => {
    const g = new DependencyGraph();
    g.addEdge('A1', 'B1');
    expect([...g.getDependencies('A1')]).toEqual(['B1']);
    expect([...g.getDependents('B1')]).toEqual(['A1']);
  });

  it('addEdge is idempotent', () => {
    const g = new DependencyGraph();
    g.addEdge('A1', 'B1');
    g.addEdge('A1', 'B1');
    expect(g.edgeCount).toBe(1);
  });

  it('skips self-edges', () => {
    const g = new DependencyGraph();
    g.addEdge('A1', 'A1');
    expect(g.edgeCount).toBe(0);
  });

  it('clearOutgoing removes edges in both directions', () => {
    const g = new DependencyGraph();
    g.addEdge('A1', 'B1');
    g.addEdge('A1', 'C1');
    g.addEdge('A2', 'B1');
    g.clearOutgoing('A1');
    expect(g.getDependencies('A1').size).toBe(0);
    expect([...g.getDependents('B1')]).toEqual(['A2']);
    expect(g.getDependents('C1').size).toBe(0);
  });

  it('removeNode drops every edge touching it', () => {
    const g = new DependencyGraph();
    g.addEdge('A1', 'B1');
    g.addEdge('B1', 'C1');
    g.addEdge('D1', 'B1');
    g.removeNode('B1');
    expect(g.getDependencies('A1').size).toBe(0);
    expect(g.getDependents('C1').size).toBe(0);
    expect(g.getDependencies('D1').size).toBe(0);
  });

  it('collectTransitiveDependents includes every reachable consumer', () => {
    // A1 reads B1, B1 reads C1, D1 reads C1.
    // C1's transitive dependents: A1, B1, D1, plus C1 itself.
    const g = new DependencyGraph();
    g.addEdge('A1', 'B1');
    g.addEdge('B1', 'C1');
    g.addEdge('D1', 'C1');
    const reachable = g.collectTransitiveDependents('C1');
    expect(new Set(reachable)).toEqual(new Set(['C1', 'B1', 'A1', 'D1']));
  });

  it('collectTransitiveDependents handles graphs with cycles without looping', () => {
    const g = new DependencyGraph();
    g.addEdge('A1', 'B1');
    g.addEdge('B1', 'A1'); // cycle
    g.addEdge('C1', 'A1');
    const reachable = g.collectTransitiveDependents('A1');
    expect(new Set(reachable)).toEqual(new Set(['A1', 'B1', 'C1']));
  });

  it('reports node + edge counts accurately', () => {
    const g = new DependencyGraph();
    expect(g.nodeCount).toBe(0);
    expect(g.edgeCount).toBe(0);
    g.addEdge('A1', 'B1');
    g.addEdge('A1', 'C1');
    g.addEdge('A2', 'C1');
    expect(g.nodeCount).toBe(4); // A1, A2, B1, C1
    expect(g.edgeCount).toBe(3);
  });

  it('clear empties the graph', () => {
    const g = new DependencyGraph();
    g.addEdge('A1', 'B1');
    g.clear();
    expect(g.nodeCount).toBe(0);
    expect(g.edgeCount).toBe(0);
  });

  it('returns an empty set for unknown nodes', () => {
    const g = new DependencyGraph();
    expect(g.getDependencies('Z99').size).toBe(0);
    expect(g.getDependents('Z99').size).toBe(0);
  });
});
