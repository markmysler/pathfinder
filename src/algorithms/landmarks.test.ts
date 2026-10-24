import fc from 'fast-check';
import plazaDeMayo from '../osm/fixtures/plaza-de-mayo.overpass.json';
import { buildRoadNetwork, type OverpassResponse } from '../osm/network';
import { prepareSearch } from '../osm/prepare';
import { randomGeoProblem } from '../test/arbitraries';
import { graphFrom, grid } from '../test/fixtures';
import { referenceDistances } from '../test/reference';
import { aStar } from './astar';
import { dijkstra } from './dijkstra';
import { alt, chooseLandmarks, landmarkHeuristic } from './landmarks';
import { runSearch, summarize } from './trace';

describe('chooseLandmarks', () => {
  it('picks the requested number of different nodes, or every node of a small graph', () => {
    const graph = grid(5);
    const { nodes } = chooseLandmarks(graph, { count: 4 });
    expect(nodes).toHaveLength(4);
    expect(new Set(nodes).size).toBe(4);
    expect(chooseLandmarks(grid(1), { count: 4 }).nodes).toEqual(new Uint32Array([0]));
  });

  it('starts with the node farthest from where it starts looking', () => {
    // Corner 24 of the grid is the farthest from corner 0.
    expect(chooseLandmarks(grid(5), { count: 1, from: 0 }).nodes[0]).toBe(24);
  });

  it('then each time takes the node farthest from every landmark so far', () => {
    const graph = grid(5);
    const { nodes } = chooseLandmarks(graph, { count: 2, from: 0 });
    // Corner 0 is the only node 8 streets away from corner 24.
    expect([...nodes]).toEqual([24, 0]);
  });

  it('stores each landmark’s distances from and to every node', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph }) => {
        const landmarks = chooseLandmarks(graph, { count: 3 });
        landmarks.nodes.forEach((landmark, i) => {
          const from = referenceDistances(graph, landmark);
          for (let n = 0; n < graph.nodeCount; n++) {
            const row = i * graph.nodeCount + n;
            const to = referenceDistances(graph, n)[landmark]!;
            if (from[n] === Infinity) expect(landmarks.from[row]).toBe(Infinity);
            else expect(landmarks.from[row]).toBeCloseTo(from[n]!, 6);
            if (to === Infinity) expect(landmarks.to[row]).toBe(Infinity);
            else expect(landmarks.to[row]).toBeCloseTo(to, 6);
          }
        });
      }),
    );
  });

  it('only picks nodes it can reach from where it starts', () => {
    // Node 3 has a road into 0 but none out of it, so from 0 there are only three nodes to pick.
    const graph = graphFrom([
      [0, 1, 1],
      [1, 0, 1],
      [1, 2, 1],
      [2, 1, 1],
      [3, 0, 1],
    ]);
    expect([...chooseLandmarks(graph, { count: 4, from: 0 }).nodes].sort()).toEqual([0, 1, 2]);
  });
});

describe('landmarkHeuristic', () => {
  it('never overestimates the cost left to the target', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph, target }) => {
        const h = landmarkHeuristic(chooseLandmarks(graph, { count: 3 }), target);
        for (let n = 0; n < graph.nodeCount; n++) {
          const actual = referenceDistances(graph, n)[target]!;
          expect(h(n)).toBeGreaterThanOrEqual(0);
          expect(h(n)).toBeLessThanOrEqual(actual + 1e-6);
        }
      }),
    );
  });

  it('is consistent: no road costs less than the drop in the estimate along it', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph, target }) => {
        const h = landmarkHeuristic(chooseLandmarks(graph, { count: 3 }), target);
        for (let e = 0; e < graph.edgeCount; e++) {
          const [from, to] = [graph.edgeSource[e]!, graph.edgeTarget[e]!];
          if (referenceDistances(graph, to)[target] === Infinity) continue;
          expect(h(from)).toBeLessThanOrEqual(graph.edgeWeight[e]! + h(to) + 1e-6);
        }
      }),
    );
  });

  it('is exact when the target is a landmark', () => {
    const graph = grid(5);
    const h = landmarkHeuristic(chooseLandmarks(graph, { count: 1, from: 0 }), 24);
    const actual = referenceDistances(graph, 0);
    // The grid runs both ways, so the distance to 24 equals the distance from 24.
    const fromCorner = referenceDistances(graph, 24);
    for (let n = 0; n < graph.nodeCount; n++) expect(h(n)).toBeCloseTo(fromCorner[n]!, 6);
    expect(h(0)).toBeCloseTo(actual[24]!, 6);
  });

  it('says how it got each estimate: from which landmark, and which way round', () => {
    const graph = grid(5);
    const landmarks = chooseLandmarks(graph, { count: 2, from: 0 });
    const h = landmarkHeuristic(landmarks, 24);
    // Both landmarks give the full distance; the first one found is kept.
    expect(h.explain(0)).toEqual({ estimate: h(0), landmark: 0, via: 'to' });
    expect(h.explain(24)).toEqual({ estimate: 0, landmark: null, via: null });
  });
});

describe('alt', () => {
  it('finds a route exactly as cheap as Dijkstra', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        const one = runSearch(dijkstra, problem).result;
        const two = runSearch(alt, problem).result;
        expect(two.found).toBe(one.found);
        if (one.found && two.found) expect(two.cost).toBeCloseTo(one.cost, 6);
      }),
    );
  });

  it('uses the landmarks it is given', () => {
    const graph = grid(6);
    const landmarks = chooseLandmarks(graph, { count: 2, from: 0 });
    const given = runSearch(alt, { graph, source: 0, target: 35, landmarks });
    const own = runSearch(aStar, {
      graph,
      source: 0,
      target: 35,
      heuristic: landmarkHeuristic(landmarks, 35),
    });
    expect(given).toEqual(own);
  });

  it('expands fewer nodes than A* with straight-line distance, on real streets', () => {
    // Driving across the Plaza de Mayo area: one-way streets make the straight line a poor guess.
    const network = buildRoadNetwork(plazaDeMayo as unknown as OverpassResponse);
    const prepared = prepareSearch(network, {
      start: { lat: -34.6057, lon: -58.3755 },
      target: { lat: -34.6115, lon: -58.3685 },
      mode: 'car',
      objective: 'fastest',
    });
    const withLandmarks = runSearch(alt, prepared);
    const straight = runSearch(aStar, prepared);
    expect(withLandmarks.result).toMatchObject({ found: true });
    expect(summarize(withLandmarks.events).expanded).toBeLessThan(
      summarize(straight.events).expanded,
    );
  });
});
