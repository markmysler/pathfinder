import { edgeRange } from '../graph/graph';
import { zeroHeuristic } from './heuristics';
import { MinHeap } from './minHeap';
import { checkProblem, foundResult, noParents } from './support';
import type { SearchEvent, SearchProblem, SearchResult } from './types';

/**
 * Greedy best-first search: the frontier is a priority queue ordered only by the heuristic's
 * estimate of the cost remaining. It rushes towards the target and is often very fast, but it
 * ignores what the route has cost so far, so it can settle for an expensive one.
 */
export function* greedy(problem: SearchProblem): Generator<SearchEvent, SearchResult> {
  checkProblem(problem);
  const { graph, source, target, heuristic = zeroHeuristic } = problem;
  const parentEdge = noParents(graph);
  const seen = new Uint8Array(graph.nodeCount);
  const frontier = new MinHeap<{ node: number; cost: number }>();

  seen[source] = 1;
  const sourcePriority = heuristic(source);
  frontier.push({ node: source, cost: 0 }, sourcePriority);
  yield { type: 'push', node: source, edge: null, cost: 0, priority: sourcePriority };

  for (let entry = frontier.pop(); entry; entry = frontier.pop()) {
    const { node, cost } = entry.value;
    yield { type: 'pop', node, cost };
    if (node === target) return foundResult(graph, parentEdge, source, target);

    const [start, end] = edgeRange(graph, node);
    for (let edge = start; edge < end; edge++) {
      const next = graph.edgeTarget[edge]!;
      if (seen[next]) continue;
      seen[next] = 1;
      parentEdge[next] = edge;
      const nextCost = cost + graph.edgeWeight[edge]!;
      const priority = heuristic(next);
      frontier.push({ node: next, cost: nextCost }, priority);
      yield { type: 'push', node: next, edge, cost: nextCost, priority };
    }
  }
  return { found: false };
}
