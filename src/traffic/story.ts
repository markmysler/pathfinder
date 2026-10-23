import { dijkstra } from '../algorithms/dijkstra';
import type { SearchResult } from '../algorithms/types';
import { edgeRange, type Graph } from '../graph/graph';
import { routingGraph, type Objective, type RoadNetwork, type RoutingGraph } from '../osm/network';
import { allowedDirections, type TravelMode } from '../osm/roads';
import { SLOWED_BELOW, type SegmentTraffic } from './match';

/** How traffic changed the best route, for telling the user. */
export interface TrafficStory {
  /** The best route on clear roads: [lon, lat] pairs, its cost then, and the same roads now. */
  clear: { positions: Float64Array; cost: number; costNow: number };
  /** The best route with traffic. */
  best: number;
  /** Whether traffic moved the best route onto other roads. */
  changed: boolean;
  /** The slowest named road on the clear route, if traffic slowed it. */
  jammed?: { name: string; share: number };
  /** The named road the new route mostly takes instead, if it changed. */
  via?: string;
}

function shortest(graph: Graph, source: number, target: number) {
  const steps = dijkstra({ graph, source, target });
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value as SearchResult;
  }
}

/** The cheapest edge from `from` to `to`, or -1 if there is none. */
function edgeBetween(graph: Graph, from: number, to: number) {
  const [start, end] = edgeRange(graph, from);
  let best = -1;
  for (let e = start; e < end; e++) {
    if (graph.edgeTarget[e] === to && (best < 0 || graph.edgeWeight[e]! < graph.edgeWeight[best]!))
      best = e;
  }
  return best;
}

const nameOf = (network: RoadNetwork, segment: number) =>
  network.wayTags[network.segmentWay[segment]!]!.name;

/**
 * Compares the best route with traffic against the best one on clear roads, between the same
 * nodes. `routing` is the graph with traffic; the clear graph is built here.
 */
export function trafficStory(
  network: RoadNetwork,
  routing: RoutingGraph,
  source: number,
  target: number,
  mode: TravelMode,
  objective: Objective,
): TrafficStory | undefined {
  const clear = routingGraph(network, mode, objective);
  const before = shortest(clear.graph, source, target);
  const now = shortest(routing.graph, source, target);
  if (!before.found || !now.found) return undefined;

  const positions = new Float64Array(2 * before.path.length);
  before.path.forEach((node, i) => {
    positions[2 * i] = network.lon[node]!;
    positions[2 * i + 1] = network.lat[node]!;
  });

  let costNow = 0;
  let jammed: TrafficStory['jammed'];
  const clearWays = new Set<number>();
  before.edges.forEach((edge, i) => {
    const segment = clear.edgeSegment[edge]!;
    clearWays.add(network.segmentWay[segment]!);
    const e = edgeBetween(routing.graph, before.path[i]!, before.path[i + 1]!);
    costNow += e < 0 ? Infinity : routing.graph.edgeWeight[e]!;
    const share = e < 0 ? 0 : (routing.edgeTraffic?.[e] ?? NaN);
    const name = nameOf(network, segment);
    if (name && share < SLOWED_BELOW && (!jammed || share < jammed.share)) {
      jammed = { name, share };
    }
  });

  const changed =
    now.path.length !== before.path.length || now.path.some((node, i) => node !== before.path[i]);
  let via: string | undefined;
  if (changed) {
    const metres = new Map<string, number>();
    for (const edge of now.edges) {
      const segment = routing.edgeSegment[edge]!;
      const name = nameOf(network, segment);
      if (!name || clearWays.has(network.segmentWay[segment]!)) continue;
      metres.set(name, (metres.get(name) ?? 0) + network.segmentLength[segment]!);
    }
    via = [...metres].sort((a, b) => b[1] - a[1])[0]?.[0];
  }

  return { clear: { positions, cost: before.cost, costNow }, best: now.cost, changed, jammed, via };
}

/** Car roads that traffic slowed or closed, to draw on the map. */
export interface TrafficRoads {
  /** [lon, lat, lon, lat] per road. */
  positions: Float64Array;
  /** Each road's slowest direction, as a share of free flow; 0 is closed. */
  share: Float32Array;
}

export function trafficRoads(network: RoadNetwork, traffic: SegmentTraffic): TrafficRoads {
  const directions = network.wayTags.map((tags) => allowedDirections(tags, 'car'));
  const positions: number[] = [];
  const shares: number[] = [];
  for (let s = 0; s < network.segmentCount; s++) {
    const allowed = directions[network.segmentWay[s]!];
    if (!allowed) continue;
    const readings = [
      allowed.forward ? traffic.forward[s]! : NaN,
      allowed.backward ? traffic.backward[s]! : NaN,
    ].filter((share) => !Number.isNaN(share));
    if (readings.length === 0) continue;
    const share = Math.min(...readings);
    if (share >= SLOWED_BELOW) continue;
    const a = network.segmentFrom[s]!;
    const b = network.segmentTo[s]!;
    positions.push(network.lon[a]!, network.lat[a]!, network.lon[b]!, network.lat[b]!);
    shares.push(share);
  }
  return { positions: Float64Array.from(positions), share: Float32Array.from(shares) };
}
