import type { Graph } from '../graph/graph';

/**
 * Shortest distances from `source` by plain Bellman-Ford relaxation. Slow but obviously
 * correct, so it serves as ground truth for the real algorithms. Unreachable nodes are Infinity.
 */
export function referenceDistances(
  graph: Graph,
  source: number,
  weightOf: (edge: number) => number = (edge) => graph.edgeWeight[edge]!,
): number[] {
  const dist = Array<number>(graph.nodeCount).fill(Infinity);
  dist[source] = 0;
  for (let round = 0; round < graph.nodeCount; round++) {
    for (let e = 0; e < graph.edgeCount; e++) {
      const from = graph.edgeSource[e]!;
      const to = graph.edgeTarget[e]!;
      if (dist[from]! + weightOf(e) < dist[to]!) dist[to] = dist[from]! + weightOf(e);
    }
  }
  return dist;
}

/** Fewest edges from `source` to every node. Unreachable nodes are Infinity. */
export const referenceHops = (graph: Graph, source: number) =>
  referenceDistances(graph, source, () => 1);
