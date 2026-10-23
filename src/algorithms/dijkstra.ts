import { aStar } from './astar';
import { zeroHeuristic } from './heuristics';
import type { SearchAlgorithm } from './types';

/**
 * Dijkstra's algorithm: the frontier is a priority queue ordered by cost so far, so nodes are
 * expanded in order of distance from the source. It is exactly A* with a heuristic that always
 * guesses zero.
 */
export const dijkstra: SearchAlgorithm = (problem) =>
  aStar({ ...problem, heuristic: zeroHeuristic });
