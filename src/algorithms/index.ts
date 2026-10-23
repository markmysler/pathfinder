import { aStar } from './astar';
import { bfs } from './bfs';
import { bidirectionalAStar, bidirectionalBfs, bidirectionalDijkstra } from './bidirectional';
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
  /** Searches from both ends at once, forward from A and backward from B. */
  bidirectional: boolean;
  /** For a bidirectional search, the one-way search it runs from each end. */
  oneWay?: string;
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
    bidirectional: false,
  },
  dfs: {
    id: 'dfs',
    name: 'Depth-first search',
    search: dfs,
    optimal: false,
    weighted: false,
    informed: false,
    frontier: 'stack',
    bidirectional: false,
  },
  greedy: {
    id: 'greedy',
    name: 'Greedy best-first',
    search: greedy,
    optimal: false,
    weighted: false,
    informed: true,
    frontier: 'priority',
    bidirectional: false,
  },
  dijkstra: {
    id: 'dijkstra',
    name: 'Dijkstra',
    search: dijkstra,
    optimal: true,
    weighted: true,
    informed: false,
    frontier: 'priority',
    bidirectional: false,
  },
  astar: {
    id: 'astar',
    name: 'A* search',
    search: aStar,
    optimal: true,
    weighted: true,
    informed: true,
    frontier: 'priority',
    bidirectional: false,
  },
  bibfs: {
    id: 'bibfs',
    name: 'Bidirectional BFS',
    search: bidirectionalBfs,
    optimal: false,
    weighted: false,
    informed: false,
    frontier: 'queue',
    bidirectional: true,
    oneWay: 'bfs',
  },
  bidijkstra: {
    id: 'bidijkstra',
    name: 'Bidirectional Dijkstra',
    search: bidirectionalDijkstra,
    optimal: true,
    weighted: true,
    informed: false,
    frontier: 'priority',
    bidirectional: true,
    oneWay: 'dijkstra',
  },
  biastar: {
    id: 'biastar',
    name: 'Bidirectional A*',
    search: bidirectionalAStar,
    optimal: true,
    weighted: true,
    informed: true,
    frontier: 'priority',
    bidirectional: true,
    oneWay: 'astar',
  },
} as const satisfies Record<string, AlgorithmInfo>;

export type AlgorithmId = keyof typeof algorithms;

/** The one-way search an algorithm runs: itself, or for a bidirectional search, from each end. */
export const oneWayOf = (algorithm: AlgorithmId) =>
  ((algorithms[algorithm] as AlgorithmInfo).oneWay ?? algorithm) as AlgorithmId;
