import { aStar } from './astar';
import { bfs } from './bfs';
import { dfs } from './dfs';
import { dijkstra } from './dijkstra';
import { greedy } from './greedy';
import type { SearchAlgorithm } from './types';

export interface AlgorithmInfo {
  id: string;
  name: string;
  search: SearchAlgorithm;
  /** Always finds the cheapest route (given an admissible heuristic, if it uses one). */
  optimal: boolean;
  /** Takes edge weights into account. */
  weighted: boolean;
  /** Uses a heuristic to steer towards the target. */
  informed: boolean;
  /** How the frontier picks what to take next: oldest first, newest first, or lowest priority. */
  frontier: FrontierRule;
}

export type FrontierRule = 'queue' | 'stack' | 'priority';

export const algorithms = {
  bfs: {
    id: 'bfs',
    name: 'Breadth-first search',
    search: bfs,
    optimal: false,
    weighted: false,
    informed: false,
    frontier: 'queue',
  },
  dfs: {
    id: 'dfs',
    name: 'Depth-first search',
    search: dfs,
    optimal: false,
    weighted: false,
    informed: false,
    frontier: 'stack',
  },
  greedy: {
    id: 'greedy',
    name: 'Greedy best-first',
    search: greedy,
    optimal: false,
    weighted: false,
    informed: true,
    frontier: 'priority',
  },
  dijkstra: {
    id: 'dijkstra',
    name: 'Dijkstra',
    search: dijkstra,
    optimal: true,
    weighted: true,
    informed: false,
    frontier: 'priority',
  },
  astar: {
    id: 'astar',
    name: 'A* search',
    search: aStar,
    optimal: true,
    weighted: true,
    informed: true,
    frontier: 'priority',
  },
} as const satisfies Record<string, AlgorithmInfo>;

export type AlgorithmId = keyof typeof algorithms;
