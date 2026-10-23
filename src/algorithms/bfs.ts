import { edgeRange } from '../graph/graph';
import { checkProblem, foundResult, noParents } from './support';
import type { SearchEvent, SearchProblem, SearchResult } from './types';

/**
 * Breadth-first search: the frontier is a FIFO queue, so nodes are expanded in order of how many
 * edges away they are. It finds the route with the fewest edges and ignores weights entirely.
 */
export function* bfs(problem: SearchProblem): Generator<SearchEvent, SearchResult> {
  checkProblem(problem);
  const { graph, source, target } = problem;
  const parentEdge = noParents(graph);
  const discovered = new Uint8Array(graph.nodeCount);
  const queue = [{ node: source, cost: 0 }];
  discovered[source] = 1;
  yield { type: 'push', node: source, edge: null, cost: 0 };

  for (let head = 0; head < queue.length; head++) {
    // The queue holds every push in order, so an entry's place in it is its push number.
    const { node, cost } = queue[head]!;
    yield { type: 'pop', node, cost, entry: head };
    if (node === target) return foundResult(graph, parentEdge, source, target);

    const [start, end] = edgeRange(graph, node);
    for (let edge = start; edge < end; edge++) {
      const next = graph.edgeTarget[edge]!;
      if (discovered[next]) continue;
      discovered[next] = 1;
      parentEdge[next] = edge;
      const nextCost = cost + graph.edgeWeight[edge]!;
      queue.push({ node: next, cost: nextCost });
      yield { type: 'push', node: next, edge, cost: nextCost };
    }
  }
  return { found: false };
}
