import { edgeRange } from '../graph/graph';
import { checkProblem, foundResult, noParents } from './support';
import type { SearchEvent, SearchProblem, SearchResult } from './types';

/**
 * Bellman-Ford, in its queue form (Bellman-Ford-Moore): instead of relaxing every road in rounds,
 * it keeps a queue of nodes whose cost just went down and relaxes the roads out of those. A node
 * is never settled for good, so it is expanded again whenever a cheaper way to it turns up, and
 * the search cannot stop at the target: it runs until no cost improves. That is the price of not
 * needing Dijkstra's rule that no road costs less than nothing.
 *
 * A push's priority is its round: one more road than the expansion that pushed it. The queue
 * hands entries out in the order they joined, so rounds come one after another.
 */
export function* bellmanFord(problem: SearchProblem): Generator<SearchEvent, SearchResult> {
  checkProblem(problem);
  const { graph, source, target } = problem;
  const parentEdge = noParents(graph);
  const bestCost = new Float64Array(graph.nodeCount).fill(Infinity);
  const queue: { node: number; cost: number; round: number }[] = [];

  bestCost[source] = 0;
  queue.push({ node: source, cost: 0, round: 0 });
  yield { type: 'push', node: source, edge: null, cost: 0, priority: 0 };

  for (let entry = 0; entry < queue.length; entry++) {
    const { node, cost, round } = queue[entry]!;
    if (cost > bestCost[node]!) {
      yield { type: 'skip', node, entry };
      continue;
    }
    yield { type: 'pop', node, cost, entry };

    const [start, end] = edgeRange(graph, node);
    for (let edge = start; edge < end; edge++) {
      const next = graph.edgeTarget[edge]!;
      const nextCost = cost + graph.edgeWeight[edge]!;
      if (nextCost >= bestCost[next]!) continue;
      bestCost[next] = nextCost;
      parentEdge[next] = edge;
      queue.push({ node: next, cost: nextCost, round: round + 1 });
      yield { type: 'push', node: next, edge, cost: nextCost, priority: round + 1 };
    }
  }
  return bestCost[target]! < Infinity
    ? foundResult(graph, parentEdge, source, target)
    : { found: false };
}
