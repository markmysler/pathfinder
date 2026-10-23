import { buildGraph, type Graph } from '../graph/graph';
import { haversineMeters } from '../graph/geo';

type EdgeList = readonly (readonly [from: number, to: number, weight: number])[];

/** Builds a graph from `[from, to, weight]` triples. Nodes are placed on a line unless given. */
export function graphFrom(
  edges: EdgeList,
  options: { nodeCount?: number; coords?: readonly [lat: number, lon: number][] } = {},
): Graph {
  const nodeCount =
    options.coords?.length ??
    options.nodeCount ??
    Math.max(-1, ...edges.flatMap(([from, to]) => [from, to])) + 1;
  const nodes = Array.from({ length: nodeCount }, (_, i) => {
    const [lat, lon] = options.coords?.[i] ?? [0, i * 0.001];
    return { lat, lon };
  });
  return buildGraph({ nodes, edges: edges.map(([from, to, weight]) => ({ from, to, weight })) });
}

/** Same as `graphFrom`, but every edge goes both ways. */
export function undirectedGraphFrom(edges: EdgeList, options?: Parameters<typeof graphFrom>[1]) {
  return graphFrom(
    edges.flatMap(([from, to, weight]) => [
      [from, to, weight] as const,
      [to, from, weight] as const,
    ]),
    options,
  );
}

/**
 * 0 → 3 directly costs 10, while 0 → 1 → 2 → 3 costs 3.
 * The fewest-hops route and the cheapest route differ.
 */
export const hopsVsCost = () =>
  graphFrom([
    [0, 3, 10],
    [0, 1, 1],
    [1, 2, 1],
    [2, 3, 1],
  ]);

/** A binary tree: 0 → {1, 2}, 1 → {3, 4}, 2 → {5, 6}. */
export const binaryTree = () =>
  graphFrom([
    [0, 1, 1],
    [0, 2, 1],
    [1, 3, 1],
    [1, 4, 1],
    [2, 5, 1],
    [2, 6, 1],
  ]);

/** A `size` × `size` grid with 4-neighbour streets, weighted by real distance (≈111 m apart). */
export function grid(size: number): Graph {
  const coords: [number, number][] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) coords.push([row * 0.001, col * 0.001]);
  }
  const id = (row: number, col: number) => row * size + col;
  const distance = (a: number, b: number) =>
    haversineMeters(coords[a]![0], coords[a]![1], coords[b]![0], coords[b]![1]);
  const edges: [number, number, number][] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (col + 1 < size) edges.push([id(row, col), id(row, col + 1), 0]);
      if (row + 1 < size) edges.push([id(row, col), id(row + 1, col), 0]);
    }
  }
  return undirectedGraphFrom(
    edges.map(([a, b]) => [a, b, distance(a, b)]),
    { coords },
  );
}

/**
 * Source 0 and target 3. Node 1 sits right next to the target but its only road there is very
 * slow; going through node 2 is far cheaper. Greedy best-first takes the bait.
 */
export function greedyTrap(): Graph {
  const coords: [number, number][] = [
    [0, 0],
    [0, 0.009],
    [0.005, 0.005],
    [0, 0.01],
  ];
  const distance = (a: number, b: number) =>
    haversineMeters(coords[a]![0], coords[a]![1], coords[b]![0], coords[b]![1]);
  return graphFrom(
    [
      [0, 1, distance(0, 1)],
      [1, 3, 100_000],
      [0, 2, distance(0, 2)],
      [2, 3, distance(2, 3)],
    ],
    { coords },
  );
}
