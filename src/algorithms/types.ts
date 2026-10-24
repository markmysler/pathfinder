import type { Graph } from '../graph/graph';
import type { Heuristic } from './heuristics';
import type { Hierarchy } from './hierarchy';
import type { Landmarks } from './landmarks';

export interface SearchProblem {
  graph: Graph;
  source: number;
  target: number;
  /** Estimated remaining cost to the target; ignored by uninformed algorithms. */
  heuristic?: Heuristic;
  /** Estimated cost from the source to a node, for informed searches that also run backwards. */
  backwardHeuristic?: Heuristic;
  /** Worked out ahead for ALT; it chooses its own if left out. */
  landmarks?: Landmarks;
  /** Worked out ahead for contraction hierarchies; it contracts the graph itself if left out. */
  hierarchy?: Hierarchy;
}

/**
 * Which end of the route a step works from. One-way searches only go forward, from the source.
 * Bidirectional searches also go backward from the target, following roads in reverse.
 */
export type Side = 'forward' | 'backward';

/**
 * What a search does, step by step. Every algorithm describes itself with the same events, which
 * is what lets the UI animate and compare any of them. `side` is 'forward' when left out.
 */
export type SearchEvent =
  /**
   * `node` enters the frontier, reached through `edge` (null for where the side starts) at
   * `cost`. Going backward, `edge` leaves `node` for the node it was reached from, and `cost` is
   * what it costs to get from `node` to the target.
   */
  | {
      type: 'push';
      node: number;
      edge: number | null;
      cost: number;
      priority?: number;
      side?: Side;
    }
  /** `node` leaves the frontier and is expanded. `entry` is the push it came from (0 = first). */
  | { type: 'pop'; node: number; cost: number; entry: number; side?: Side }
  /** An outdated frontier entry for `node`, made by push number `entry`, is discarded. */
  | { type: 'skip'; node: number; entry: number; side?: Side }
  /**
   * Both sides have reached `node`, making the best route known so far, costing `cost`. `length`
   * is what the search minimises: the same as `cost`, except for BFS, which counts roads.
   */
  | { type: 'meet'; node: number; cost: number; length: number };

export type SearchResult =
  | { found: true; path: number[]; edges: number[]; cost: number }
  /** `negativeLoop`: Bellman-Ford found a loop costing less than nothing, so no cheapest route. */
  | { found: false; negativeLoop?: boolean };

export type SearchAlgorithm = (problem: SearchProblem) => Generator<SearchEvent, SearchResult>;

/**
 * The edges a search's events name, when they are not the graph's own: contraction hierarchies
 * add shortcuts. `degree` is how many roads a node's expansion looks along on a side.
 */
export interface SearchEdges {
  from: ArrayLike<number>;
  to: ArrayLike<number>;
  degree(node: number, side: 0 | 1): number;
}
