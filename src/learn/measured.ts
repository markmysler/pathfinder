/**
 * Bellman-Ford, ALT and contraction hierarchies measured on real Buenos Aires streets with
 * Pathfinder's own code: a car's fastest route, on the roads Explore would download. Times are
 * from one run in Node on 24 October 2026, so a browser may differ a little.
 */
export interface Measured {
  route: string;
  nodes: number;
  /** One-way road directions in the graph. */
  roads: number;
  shortcuts: number;
  landmarksMs: number;
  contractMs: number;
  /** Nodes each search expanded. */
  expanded: { dijkstra: number; astar: number; alt: number; ch: number; bellmanford: number };
}

export const MEASURED: readonly Measured[] = [
  {
    route: '1 km, Plaza de Mayo → Obelisco',
    nodes: 6_728,
    roads: 4_287,
    shortcuts: 4_253,
    landmarksMs: 11,
    contractMs: 82,
    expanded: {
      dijkstra: 1_307,
      astar: 450,
      alt: 138,
      ch: 20,
      bellmanford: 19_962,
    },
  },
  {
    route: '3 km, Recoleta → Plaza de Mayo',
    nodes: 21_092,
    roads: 15_542,
    shortcuts: 16_359,
    landmarksMs: 18,
    contractMs: 211,
    expanded: {
      dijkstra: 6_013,
      astar: 3_775,
      alt: 1_508,
      ch: 51,
      bellmanford: 105_874,
    },
  },
  {
    route: '9 km, Belgrano → Plaza de Mayo',
    nodes: 68_855,
    roads: 53_845,
    shortcuts: 64_411,
    landmarksMs: 76,
    contractMs: 1_247,
    expanded: {
      dijkstra: 25_195,
      astar: 13_874,
      alt: 761,
      ch: 220,
      bellmanford: 1_296_303,
    },
  },
];
