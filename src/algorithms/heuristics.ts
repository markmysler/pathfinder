import type { Graph } from '../graph/graph';
import { haversineMeters } from '../graph/geo';

/** Estimated cost from a node to the search target. */
export type Heuristic = (node: number) => number;

export const zeroHeuristic: Heuristic = () => 0;

/**
 * Straight-line distance to `target`, divided by `maxSpeed` (meters per weight unit). It never
 * overestimates as long as no edge can be travelled faster than `maxSpeed`; use 1 when weights
 * are distances in meters.
 */
export function straightLineHeuristic(graph: Graph, target: number, maxSpeed = 1): Heuristic {
  const lat = graph.lat[target]!;
  const lon = graph.lon[target]!;
  return (node) => haversineMeters(graph.lat[node]!, graph.lon[node]!, lat, lon) / maxSpeed;
}
