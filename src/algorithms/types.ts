import type { Graph } from '../graph/graph';
import type { Heuristic } from './heuristics';

export interface SearchProblem {
  graph: Graph;
  source: number;
  target: number;
  /** Estimated remaining cost to the target; ignored by uninformed algorithms. */
  heuristic?: Heuristic;
}

/**
 * What a search does, step by step. Every algorithm describes itself with the same three events,
 * which is what lets the UI animate and compare any of them.
 */
export type SearchEvent =
  /** `node` enters the frontier, reached through `edge` (null for the source) at `cost`. */
  | { type: 'push'; node: number; edge: number | null; cost: number; priority?: number }
  /** `node` leaves the frontier and is expanded. */
  | { type: 'pop'; node: number; cost: number }
  /** An outdated frontier entry for an already expanded `node` is discarded. */
  | { type: 'skip'; node: number };

export type SearchResult =
  { found: true; path: number[]; edges: number[]; cost: number } | { found: false };

export type SearchAlgorithm = (problem: SearchProblem) => Generator<SearchEvent, SearchResult>;
