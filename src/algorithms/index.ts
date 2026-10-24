import { aStar } from './astar';
import { bfs } from './bfs';
import { bellmanFord } from './bellmanFord';
import { bidirectionalAStar, bidirectionalBfs, bidirectionalDijkstra } from './bidirectional';
import { dfs } from './dfs';
import { dijkstra } from './dijkstra';
import { greedy } from './greedy';
import { contractionHierarchies } from './hierarchy';
import { alt } from './landmarks';
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
  /** Built for other jobs than one route on a map, and listed apart. */
  advanced: boolean;
  /** What it works out over the whole map before searching, if anything. */
  prepares?: Preparation;
  /** Keeps going after reaching B, until nothing improves. */
  exhaustive?: boolean;
}

/** ALT's landmarks, or contraction hierarchies' order and shortcuts. */
export type Preparation = 'landmarks' | 'hierarchy';

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
    advanced: false,
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
    advanced: false,
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
    advanced: false,
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
    advanced: false,
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
    advanced: false,
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
    advanced: false,
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
    advanced: false,
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
    advanced: false,
  },
  bellmanford: {
    id: 'bellmanford',
    name: 'Bellman-Ford',
    search: bellmanFord,
    optimal: true,
    weighted: true,
    informed: false,
    frontier: 'queue',
    bidirectional: false,
    advanced: true,
    exhaustive: true,
  },
  alt: {
    id: 'alt',
    name: 'ALT (A* with landmarks)',
    search: alt,
    optimal: true,
    weighted: true,
    informed: true,
    frontier: 'priority',
    bidirectional: false,
    advanced: true,
    prepares: 'landmarks',
  },
  ch: {
    id: 'ch',
    name: 'Contraction hierarchies',
    search: contractionHierarchies,
    optimal: true,
    weighted: true,
    informed: false,
    frontier: 'priority',
    bidirectional: true,
    advanced: true,
    prepares: 'hierarchy',
  },
} as const satisfies Record<string, AlgorithmInfo>;

export type AlgorithmId = keyof typeof algorithms;

/** The one-way search an algorithm runs: itself, or for a bidirectional search, from each end. */
export const oneWayOf = (algorithm: AlgorithmId) =>
  ((algorithms[algorithm] as AlgorithmInfo).oneWay ?? algorithm) as AlgorithmId;
