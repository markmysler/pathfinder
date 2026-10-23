import { algorithms, type AlgorithmId } from '../algorithms';
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
  /** The roads the search explored. */
  roads: [Point, Point][];
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
  return { prepared, at, size, streets };
}

/** Runs one algorithm between the two corners, ready to draw as a small map. */
export function streetSearch(algorithm: AlgorithmId): StreetSearch {
  cached ??= prepare();
  const { prepared, at, size, streets } = cached;
  const { graph } = prepared;
  const { events, result } = runSearch(algorithms[algorithm].search, prepared);
  const roads: [Point, Point][] = [];
  let expanded = 0;
  for (const event of events) {
    if (event.type === 'pop') expanded++;
    if (event.type === 'push' && event.edge !== null) {
      roads.push([at(graph.edgeSource[event.edge]!), at(event.node)]);
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
