import { straightLineHeuristic, type Heuristic } from '../algorithms/heuristics';
import { largestStronglyConnectedComponent } from '../graph/components';
import { nearestNode } from '../graph/nearest';
import type { LatLon } from './area';
import { routingGraph, type Objective, type RoadNetwork, type RoutingGraph } from './network';
import type { TravelMode } from './roads';

export interface SearchRequest {
  start: LatLon;
  target: LatLon;
  mode: TravelMode;
  objective: Objective;
}

export interface Snap {
  node: number;
  /** How far the requested point was from the node it snapped to. */
  meters: number;
}

export interface PreparedSearch extends RoutingGraph {
  source: number;
  target: number;
  /** Estimated cost to the target. */
  heuristic: Heuristic;
  /** Estimated cost from the source, for searching backward from the target. */
  backwardHeuristic: Heuristic;
  snapped: { start: Snap; target: Snap };
}

export class NoRoadNearbyError extends Error {
  constructor(readonly mode: TravelMode) {
    super(`There are no connected roads for ${mode} travel in this area`);
    this.name = 'NoRoadNearbyError';
  }
}

/**
 * Turns a road network and a request into everything a search needs: the mode's graph, start and
 * target snapped onto its largest connected component, and matching heuristics.
 */
export function prepareSearch(network: RoadNetwork, request: SearchRequest): PreparedSearch {
  const { graph, maxSpeed } = routingGraph(network, request.mode, request.objective);
  const usable = largestStronglyConnectedComponent(graph);
  if (usable.reduce((count, inside) => count + inside, 0) < 2) {
    throw new NoRoadNearbyError(request.mode);
  }
  const start = nearestNode(graph, request.start.lat, request.start.lon, usable)!;
  const target = nearestNode(graph, request.target.lat, request.target.lon, usable)!;
  return {
    graph,
    maxSpeed,
    source: start.node,
    target: target.node,
    heuristic: straightLineHeuristic(graph, target.node, maxSpeed),
    backwardHeuristic: straightLineHeuristic(graph, start.node, maxSpeed),
    snapped: { start, target },
  };
}
