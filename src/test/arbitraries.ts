import fc from 'fast-check';
import { buildGraph, type Graph } from '../graph/graph';
import { haversineMeters } from '../graph/geo';

export interface RandomProblem {
  graph: Graph;
  source: number;
  target: number;
}

/**
 * Random directed graphs of nodes scattered over a ~2 km square. Every edge weighs at least its
 * straight-line length, so the straight-line heuristic is admissible and consistent. Self-loops
 * and parallel edges are allowed on purpose.
 */
export const randomGeoProblem = (maxNodes = 12): fc.Arbitrary<RandomProblem> =>
  fc.integer({ min: 1, max: maxNodes }).chain((n) =>
    fc
      .record({
        nodes: fc.array(
          fc.record({
            lat: fc.double({ min: 0, max: 0.02, noNaN: true }),
            lon: fc.double({ min: 0, max: 0.02, noNaN: true }),
          }),
          { minLength: n, maxLength: n },
        ),
        edges: fc.array(
          fc.record({
            from: fc.nat(n - 1),
            to: fc.nat(n - 1),
            slowdown: fc.double({ min: 1, max: 3, noNaN: true }),
          }),
          { maxLength: n * 3 },
        ),
        source: fc.nat(n - 1),
        target: fc.nat(n - 1),
      })
      .map(({ nodes, edges, source, target }) => ({
        graph: buildGraph({
          nodes,
          edges: edges.map(({ from, to, slowdown }) => ({
            from,
            to,
            weight:
              haversineMeters(nodes[from]!.lat, nodes[from]!.lon, nodes[to]!.lat, nodes[to]!.lon) *
              slowdown,
          })),
        }),
        source,
        target,
      })),
  );
