import { buildGraph, type Graph } from '../graph/graph';
import { haversineMeters } from '../graph/geo';
import type { SegmentTraffic } from '../traffic/match';
import { allowedDirections, speedKmh, type Tags, type TravelMode } from './roads';

export type OverpassElement =
  | { type: 'node'; id: number; lat: number; lon: number }
  | { type: 'way'; id: number; nodes: number[]; tags?: Record<string, string> }
  | { type: 'relation'; id: number };

export interface OverpassResponse {
  elements: OverpassElement[];
}

/**
 * Every road in an area, independent of travel mode: intersections and bends as nodes, and the
 * stretches between consecutive nodes of a way as segments. Typed arrays keep it compact and
 * cheap to cache or send to a worker.
 */
export interface RoadNetwork {
  nodeCount: number;
  osmId: Float64Array;
  lat: Float64Array;
  lon: Float64Array;
  wayTags: Tags[];
  segmentCount: number;
  segmentFrom: Uint32Array;
  segmentTo: Uint32Array;
  segmentWay: Uint32Array;
  /** Length of each segment in meters. */
  segmentLength: Float64Array;
}

const MODES: readonly TravelMode[] = ['car', 'bike', 'walk'];
const isRoad = (tags: Tags) => MODES.some((mode) => allowedDirections(tags, mode) !== null);

export function buildRoadNetwork(response: OverpassResponse): RoadNetwork {
  const coords = new Map<number, { lat: number; lon: number }>();
  for (const element of response.elements) {
    if (element.type === 'node') coords.set(element.id, element);
  }

  const index = new Map<number, number>();
  const osmId: number[] = [];
  const lat: number[] = [];
  const lon: number[] = [];
  const nodeIndex = (id: number, at: { lat: number; lon: number }) => {
    let i = index.get(id);
    if (i === undefined) {
      i = osmId.length;
      index.set(id, i);
      osmId.push(id);
      lat.push(at.lat);
      lon.push(at.lon);
    }
    return i;
  };

  const wayTags: Tags[] = [];
  const from: number[] = [];
  const to: number[] = [];
  const way: number[] = [];
  const length: number[] = [];
  for (const element of response.elements) {
    if (element.type !== 'way' || !element.tags || !isRoad(element.tags)) continue;
    const wayIndex = wayTags.length;
    let used = false;
    for (let i = 0; i + 1 < element.nodes.length; i++) {
      const a = element.nodes[i]!;
      const b = element.nodes[i + 1]!;
      const aAt = coords.get(a);
      const bAt = coords.get(b);
      if (a === b || !aAt || !bAt) continue;
      from.push(nodeIndex(a, aAt));
      to.push(nodeIndex(b, bAt));
      way.push(wayIndex);
      length.push(haversineMeters(aAt.lat, aAt.lon, bAt.lat, bAt.lon));
      used = true;
    }
    if (used) wayTags.push(element.tags);
  }

  return {
    nodeCount: osmId.length,
    osmId: Float64Array.from(osmId),
    lat: Float64Array.from(lat),
    lon: Float64Array.from(lon),
    wayTags,
    segmentCount: from.length,
    segmentFrom: Uint32Array.from(from),
    segmentTo: Uint32Array.from(to),
    segmentWay: Uint32Array.from(way),
    segmentLength: Float64Array.from(length),
  };
}

export type Objective = 'fastest' | 'shortest';

export interface RoutingGraph {
  /** Edge weights are seconds for the fastest route and meters for the shortest. */
  graph: Graph;
  /**
   * The highest speed on any edge, in meters per weight unit. Dividing a straight-line distance
   * by it gives a heuristic that never overestimates.
   */
  maxSpeed: number;
  /**
   * For car graphs built with traffic: each edge's current speed as a share of free flow, in
   * graph edge order, NaN where there was no reading.
   */
  edgeTraffic?: Float32Array;
}

/**
 * The graph one travel mode sees: only roads it may use, in the directions it may use them.
 * Live traffic, when given, applies to cars: closed directions are left out, and for the fastest
 * route each direction's usual speed is scaled by its current share of free flow.
 */
export function routingGraph(
  network: RoadNetwork,
  mode: TravelMode,
  objective: Objective,
  traffic?: SegmentTraffic,
): RoutingGraph {
  const rules = network.wayTags.map((tags) => ({
    directions: allowedDirections(tags, mode),
    metersPerSecond: speedKmh(tags, mode) / 3.6,
  }));
  const live = mode === 'car' ? traffic : undefined;

  const edges: { from: number; to: number; weight: number; traffic: number }[] = [];
  let maxSpeed = objective === 'shortest' ? 1 : 0;
  for (let s = 0; s < network.segmentCount; s++) {
    const { directions, metersPerSecond } = rules[network.segmentWay[s]!]!;
    if (!directions) continue;
    const meters = network.segmentLength[s]!;
    const a = network.segmentFrom[s]!;
    const b = network.segmentTo[s]!;
    const add = (from: number, to: number, share: number) => {
      if (share === 0) return; // closed
      const speed = metersPerSecond * (Number.isNaN(share) ? 1 : share);
      const weight = objective === 'shortest' ? meters : meters / speed;
      if (objective === 'fastest') maxSpeed = Math.max(maxSpeed, speed);
      edges.push({ from, to, weight, traffic: share });
    };
    if (directions.forward) add(a, b, live?.forward[s] ?? NaN);
    if (directions.backward) add(b, a, live?.backward[s] ?? NaN);
  }

  const nodes = Array.from({ length: network.nodeCount }, (_, i) => ({
    lat: network.lat[i]!,
    lon: network.lon[i]!,
  }));
  const graph = buildGraph({ nodes, edges });
  if (!live) return { graph, maxSpeed: maxSpeed || 1 };

  // buildGraph groups edges by source and keeps their order, so the same pass lines them up.
  const edgeTraffic = new Float32Array(graph.edgeCount);
  const nextSlot = graph.firstEdge.slice(0, graph.nodeCount);
  for (const { from, traffic: share } of edges) edgeTraffic[nextSlot[from]!++] = share;
  return { graph, maxSpeed: maxSpeed || 1, edgeTraffic };
}
