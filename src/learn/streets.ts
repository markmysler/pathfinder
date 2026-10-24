import { algorithms, type AlgorithmId, type AlgorithmInfo } from '../algorithms';
import { contract } from '../algorithms/hierarchy';
import { chooseLandmarks, landmarkHeuristic } from '../algorithms/landmarks';
import { runSearch } from '../algorithms/trace';
import plazaDeMayo from '../osm/fixtures/plaza-de-mayo.overpass.json';
import { buildRoadNetwork, type OverpassResponse } from '../osm/network';
import { prepareSearch } from '../osm/prepare';

type Point = readonly [number, number];

/** Two corners of the recorded Plaza de Mayo streets, about 800 m apart. */
export const STREETS_FROM = { lat: -34.61, lon: -58.369 };
export const STREETS_TO = { lat: -34.606, lon: -58.3755 };

export interface StreetSearch {
  /** Every street in the area, for the backdrop. */
  streets: [Point, Point][];
  /** The roads the search explored, from the node it explored them from, and its side. */
  roads: [Point, Point, number][];
  route: { points: Point[]; cost: number } | null;
  expanded: number;
  start: Point;
  target: Point;
  /** Width and height of the box everything is projected into. */
  size: Point;
}

const WIDTH = 400;
let cached: ReturnType<typeof prepare> | null = null;

/** The recorded area as a car's fastest-route graph, and a flat projection that fits it. */
function prepare() {
  const network = buildRoadNetwork(plazaDeMayo as unknown as OverpassResponse);
  const prepared = prepareSearch(network, {
    start: STREETS_FROM,
    target: STREETS_TO,
    mode: 'car',
    objective: 'fastest',
  });
  const { lat, lon } = network;
  const [south, north] = [Math.min(...lat), Math.max(...lat)];
  const [west, east] = [Math.min(...lon), Math.max(...lon)];
  // Longitude degrees shrink with latitude; scale them so the streets keep their shape.
  const squash = Math.cos(((south + north) / 2) * (Math.PI / 180));
  const scale = WIDTH / ((east - west) * squash);
  const size: Point = [WIDTH, (north - south) * scale];
  const at = (node: number): Point => [
    (lon[node]! - west) * squash * scale,
    (north - lat[node]!) * scale,
  ];
  const streets: [Point, Point][] = [];
  for (let s = 0; s < network.segmentCount; s++) {
    streets.push([at(network.segmentFrom[s]!), at(network.segmentTo[s]!)]);
  }
  // Prepared once, like Explore does for the same roads.
  const { graph } = prepared;
  const landmarks = chooseLandmarks(graph, { from: prepared.source });
  const hierarchy = contract(graph);
  return { prepared, at, size, streets, landmarks, hierarchy };
}

/** Runs one algorithm between the two corners, ready to draw as a small map. */
export function streetSearch(algorithm: AlgorithmId): StreetSearch {
  cached ??= prepare();
  const { prepared, at, size, streets, landmarks, hierarchy } = cached;
  const { prepares } = algorithms[algorithm] as AlgorithmInfo;
  const { events, result } = runSearch(algorithms[algorithm].search, {
    ...prepared,
    landmarks,
    hierarchy,
  });
  // Contraction hierarchies' events name shortcuts too, numbered after the graph's own edges.
  const [edgeFrom, edgeTo] =
    prepares === 'hierarchy'
      ? [hierarchy.edgeFrom, hierarchy.edgeTo]
      : [prepared.graph.edgeSource, prepared.graph.edgeTarget];
  const roads: [Point, Point, number][] = [];
  let expanded = 0;
  for (const event of events) {
    if (event.type === 'pop') expanded++;
    if (event.type === 'push' && event.edge !== null) {
      // Going backward the road leads out of the new node, so it was explored from its far end.
      const backward = event.side === 'backward';
      const from = backward ? edgeTo[event.edge]! : edgeFrom[event.edge]!;
      roads.push([at(from), at(event.node), backward ? 1 : 0]);
    }
  }
  return {
    streets,
    roads,
    route: result.found ? { points: result.path.map(at), cost: result.cost } : null,
    expanded,
    start: at(prepared.source),
    target: at(prepared.target),
    size,
  };
}

/**
 * ALT's landmarks on the recorded streets, numbered in the order chosen, and the one that gave
 * the most of the estimates on the search between the two corners.
 */
export function streetLandmarks() {
  cached ??= prepare();
  const { prepared, at, size, streets, landmarks } = cached;
  const { events } = runSearch(algorithms.alt.search, { ...prepared, landmarks });
  const explain = landmarkHeuristic(landmarks, prepared.target).explain;
  const tally = new Array<number>(landmarks.nodes.length).fill(0);
  for (const event of events) {
    if (event.type !== 'pop') continue;
    const { landmark } = explain(event.node);
    if (landmark !== null) tally[landmark]!++;
  }
  return {
    streets,
    size,
    start: at(prepared.source),
    target: at(prepared.target),
    points: Array.from(landmarks.nodes, (node) => at(node)),
    mostUsed: tally.indexOf(Math.max(...tally)),
  };
}
