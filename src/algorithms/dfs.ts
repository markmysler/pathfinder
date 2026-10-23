import { edgeRange } from '../graph/graph';
import { checkProblem, foundResult, noParents } from './support';
import type { SearchEvent, SearchProblem, SearchResult } from './types';

/**
 * Depth-first search: the frontier is a LIFO stack, so it follows one branch as deep as it can
 * before backtracking. It finds *a* route, usually a long and winding one.
 */
export function* dfs(problem: SearchProblem): Generator<SearchEvent, SearchResult> {
  checkProblem(problem);
  const { graph, source, target } = problem;
  const parentEdge = noParents(graph);
  const expanded = new Uint8Array(graph.nodeCount);
  const stack: { node: number; edge: number | null; cost: number }[] = [
    { node: source, edge: null, cost: 0 },
  ];
  yield { type: 'push', node: source, edge: null, cost: 0 };

  while (stack.length > 0) {
    const { node, edge, cost } = stack.pop()!;
    if (expanded[node]) {
      yield { type: 'skip', node };
      continue;
    }
    expanded[node] = 1;
    if (edge !== null) parentEdge[node] = edge;
    yield { type: 'pop', node, cost };
    if (node === target) return foundResult(graph, parentEdge, source, target);

    // Push in reverse so the first edge ends up on top of the stack and is explored first.
    const [start, end] = edgeRange(graph, node);
    for (let nextEdge = end - 1; nextEdge >= start; nextEdge--) {
      const next = graph.edgeTarget[nextEdge]!;
      if (expanded[next]) continue;
      const entry = { node: next, edge: nextEdge, cost: cost + graph.edgeWeight[nextEdge]! };
      stack.push(entry);
      yield { type: 'push', ...entry };
    }
  }
  return { found: false };
}
