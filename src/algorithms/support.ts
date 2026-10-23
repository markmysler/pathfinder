import type { Graph } from '../graph/graph';
import type { SearchProblem, SearchResult } from './types';

export function checkProblem({ graph, source, target }: SearchProblem): void {
  for (const [role, node] of [
    ['source', source],
    ['target', target],
  ] as const) {
    if (!Number.isInteger(node) || node < 0 || node >= graph.nodeCount) {
      throw new RangeError(`The ${role} node ${node} is not in the graph`);
    }
  }
}

/** Walks `parentEdge` back from `target` to `source` and returns the route between them. */
export function foundResult(
  graph: Graph,
  parentEdge: Int32Array,
  source: number,
  target: number,
): SearchResult {
  const path = [target];
  const edges: number[] = [];
  for (let node = target; node !== source;) {
    const edge = parentEdge[node]!;
    edges.push(edge);
    node = graph.edgeSource[edge]!;
    path.push(node);
  }
  path.reverse();
  edges.reverse();
  const cost = edges.reduce((sum, edge) => sum + graph.edgeWeight[edge]!, 0);
  return { found: true, path, edges, cost };
}

export const noParents = (graph: Graph) => new Int32Array(graph.nodeCount).fill(-1);
