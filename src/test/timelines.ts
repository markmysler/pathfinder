import { algorithms, type AlgorithmInfo } from '../algorithms';
import { straightLineHeuristic } from '../algorithms/heuristics';
import { contract, hierarchyEdges } from '../algorithms/hierarchy';
import { runSearch } from '../algorithms/trace';
import type { SearchProblem } from '../algorithms/types';
import { buildTimeline } from '../playback/timeline';

/**
 * Runs an algorithm with straight-line estimates both ways and lays its search out for playback,
 * as the app does: contraction hierarchies contract first, so their shortcuts can be drawn.
 */
export function solve(
  problem: Pick<SearchProblem, 'graph' | 'source' | 'target'>,
  algorithm: AlgorithmInfo = algorithms.astar,
) {
  const heuristic = straightLineHeuristic(problem.graph, problem.target);
  const backwardHeuristic = straightLineHeuristic(problem.graph, problem.source);
  const hierarchy = algorithm.prepares === 'hierarchy' ? contract(problem.graph) : undefined;
  const trace = runSearch(algorithm.search, {
    ...problem,
    heuristic,
    backwardHeuristic,
    hierarchy,
  });
  const timeline = buildTimeline(
    problem.graph,
    trace,
    heuristic,
    algorithm.frontier,
    backwardHeuristic,
    {
      edges: hierarchy && hierarchyEdges(hierarchy),
      exhaustive: algorithm.exhaustive,
    },
  );
  return { trace, timeline };
}
