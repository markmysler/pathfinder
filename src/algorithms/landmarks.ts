import { distancesFrom, distancesTo } from '../graph/distances';
import type { Graph } from '../graph/graph';
import { aStar } from './astar';
import type { Heuristic } from './heuristics';
import { checkProblem } from './support';
import type { SearchEvent, SearchProblem, SearchResult } from './types';

/**
 * A few nodes, each with its cheapest cost from and to every node of the graph. They are what
 * ALT's estimate is made of, so they are worked out once, before any search.
 */
export interface Landmarks {
  /** In the order they were chosen. */
  nodes: Uint32Array;
  nodeCount: number;
  /** Row i, at `i * nodeCount + n`: the cost from landmark i to node n. */
  from: Float64Array;
  /** Row i: the cost from node n to landmark i. */
  to: Float64Array;
}

export const LANDMARK_COUNT = 8;

/**
 * Chooses landmarks far apart, around the edge of the graph: first the node farthest from
 * `from`, then each time the node farthest from all landmarks so far. Distance is the round
 * trip, there and back, since one-way streets make the two differ. Only nodes reachable both
 * ways from `from` are considered, so every landmark helps the searches that start there.
 */
export function chooseLandmarks(
  graph: Graph,
  { count = LANDMARK_COUNT, from: start = 0 }: { count?: number; from?: number } = {},
): Landmarks {
  const { nodeCount } = graph;
  const there = distancesFrom(graph, start);
  const back = distancesTo(graph, start);
  // How far each candidate is from the nearest landmark so far; to begin with, from the start.
  const nearest = new Float64Array(nodeCount);
  for (let n = 0; n < nodeCount; n++) nearest[n] = there[n]! + back[n]!;

  const chosen: number[] = [];
  const fromRows: Float64Array[] = [];
  const toRows: Float64Array[] = [];
  while (chosen.length < count) {
    let pick = -1;
    for (let n = 0; n < nodeCount; n++) {
      const d = nearest[n]!;
      if (d === Infinity || Number.isNaN(d) || chosen.includes(n)) continue;
      if (pick < 0 || d > nearest[pick]!) pick = n;
    }
    if (pick < 0) break;
    chosen.push(pick);
    const fromRow = distancesFrom(graph, pick);
    const toRow = distancesTo(graph, pick);
    fromRows.push(fromRow);
    toRows.push(toRow);
    for (let n = 0; n < nodeCount; n++) {
      if (nearest[n] === Infinity) continue;
      nearest[n] =
        chosen.length === 1
          ? fromRow[n]! + toRow[n]!
          : Math.min(nearest[n]!, fromRow[n]! + toRow[n]!);
    }
  }

  const from = new Float64Array(chosen.length * nodeCount);
  const to = new Float64Array(chosen.length * nodeCount);
  fromRows.forEach((row, i) => from.set(row, i * nodeCount));
  toRows.forEach((row, i) => to.set(row, i * nodeCount));
  return { nodes: Uint32Array.from(chosen), nodeCount, from, to };
}

/** How an estimate was found: the landmark that gave it, and on which side of the trip. */
export interface LandmarkEstimate {
  estimate: number;
  /** Index into the landmarks; null when no landmark beats 0. */
  landmark: number | null;
  /**
   * 'to': the landmark lies beyond the target, so going to it via the target can't be cheaper
   * than going straight to it. 'from': it lies behind the node, likewise for coming from it.
   */
  via: 'to' | 'from' | null;
}

export interface LandmarkHeuristic extends Heuristic {
  explain(node: number): LandmarkEstimate;
}

/**
 * ALT's estimate of the cost from a node to `target`, by the triangle inequality: for every
 * landmark L, cost(n → t) ≥ cost(n → L) − cost(t → L) and ≥ cost(L → t) − cost(L → n). The
 * largest of these is the estimate. It never overestimates, and it is consistent. Landmarks a
 * node or the target can't reach or be reached from give no bound and are left out.
 */
export function landmarkHeuristic(landmarks: Landmarks, target: number): LandmarkHeuristic {
  const { nodes, nodeCount, from, to } = landmarks;
  const explain = (node: number): LandmarkEstimate => {
    let best: LandmarkEstimate = { estimate: 0, landmark: null, via: null };
    for (let i = 0; i < nodes.length; i++) {
      const row = i * nodeCount;
      const ahead = to[row + node]! - to[row + target]!;
      if (ahead > best.estimate && ahead < Infinity)
        best = { estimate: ahead, landmark: i, via: 'to' };
      const behind = from[row + target]! - from[row + node]!;
      if (behind > best.estimate && behind < Infinity) {
        best = { estimate: behind, landmark: i, via: 'from' };
      }
    }
    return best;
  };
  const heuristic = ((node: number) => explain(node).estimate) as LandmarkHeuristic;
  heuristic.explain = explain;
  return heuristic;
}

/**
 * ALT (A*, Landmarks, Triangle inequality): A* steered by landmark estimates instead of the
 * straight line. Landmarks are chosen first unless the problem brings them.
 */
export function* alt(problem: SearchProblem): Generator<SearchEvent, SearchResult> {
  checkProblem(problem);
  const landmarks = problem.landmarks ?? chooseLandmarks(problem.graph, { from: problem.source });
  return yield* aStar({ ...problem, heuristic: landmarkHeuristic(landmarks, problem.target) });
}
