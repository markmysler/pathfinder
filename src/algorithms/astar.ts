import { edgeRange } from '../graph/graph';
import { zeroHeuristic } from './heuristics';
import { MinHeap } from './minHeap';
import { checkProblem, foundResult, noParents } from './support';
import type { SearchEvent, SearchProblem, SearchResult } from './types';

/**
 * A*: the frontier is a priority queue ordered by cost so far plus the heuristic's estimate of
 * the cost remaining. With an admissible heuristic it finds the cheapest route while expanding
 * far fewer nodes than Dijkstra.
 *
 * Outdated frontier entries are skipped rather than removed. A node is expanded again if a
 * cheaper way to it turns up later, which keeps the result optimal even when the heuristic is
 * admissible but not consistent.
 */
export function* aStar(problem: SearchProblem): Generator<SearchEvent, SearchResult> {
  checkProblem(problem);
  const { graph, source, target, heuristic = zeroHeuristic } = problem;
  const parentEdge = noParents(graph);
  const bestCost = new Float64Array(graph.nodeCount).fill(Infinity);
  const frontier = new MinHeap<{ node: number; cost: number; entry: number }>();
  let pushes = 0;

  bestCost[source] = 0;
  const sourcePriority = heuristic(source);
  frontier.push({ node: source, cost: 0, entry: pushes++ }, sourcePriority);
  yield { type: 'push', node: source, edge: null, cost: 0, priority: sourcePriority };

  for (let entry = frontier.pop(); entry; entry = frontier.pop()) {
    const { node, cost } = entry.value;
    if (cost > bestCost[node]!) {
      yield { type: 'skip', node, entry: entry.value.entry };
      continue;
    }
    yield { type: 'pop', node, cost, entry: entry.value.entry };
    if (node === target) return foundResult(graph, parentEdge, source, target);

    const [start, end] = edgeRange(graph, node);
    for (let edge = start; edge < end; edge++) {
      const next = graph.edgeTarget[edge]!;
      const nextCost = cost + graph.edgeWeight[edge]!;
      if (nextCost >= bestCost[next]!) continue;
      bestCost[next] = nextCost;
      parentEdge[next] = edge;
      const priority = nextCost + heuristic(next);
      frontier.push({ node: next, cost: nextCost, entry: pushes++ }, priority);
      yield { type: 'push', node: next, edge, cost: nextCost, priority };
    }
  }
  return { found: false };
}
