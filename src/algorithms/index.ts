import { bfs } from './bfs';
import { dfs } from './dfs';
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
}

export const algorithms = {
  bfs: {
    id: 'bfs',
    name: 'Breadth-first search',
    search: bfs,
    optimal: false,
    weighted: false,
    informed: false,
  },
  dfs: {
    id: 'dfs',
    name: 'Depth-first search',
    search: dfs,
    optimal: false,
    weighted: false,
    informed: false,
  },
} as const satisfies Record<string, AlgorithmInfo>;

export type AlgorithmId = keyof typeof algorithms;
