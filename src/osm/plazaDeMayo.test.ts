import fc from 'fast-check';
import { aStar } from '../algorithms/astar';
import { dijkstra } from '../algorithms/dijkstra';
import { runSearch } from '../algorithms/trace';
import { largestStronglyConnectedComponent } from '../graph/components';
import plazaDeMayo from './fixtures/plaza-de-mayo.overpass.json';
import { buildRoadNetwork, routingGraph, type OverpassResponse } from './network';
import { prepareSearch } from './prepare';
import type { TravelMode } from './roads';

// Real OpenStreetMap data: ≈ 700 m around Plaza de Mayo, Buenos Aires (see fixtures/README.md).
const network = buildRoadNetwork(plazaDeMayo as unknown as OverpassResponse);
const casaRosada = { lat: -34.608, lon: -58.3703 };
const cabildo = { lat: -34.6087, lon: -58.3738 };
const modes: TravelMode[] = ['car', 'bike', 'walk'];

describe('the Plaza de Mayo fixture', () => {
  it('becomes a network of hundreds of real road segments', () => {
    expect(network.nodeCount).toBeGreaterThan(800);
    expect(network.segmentCount).toBeGreaterThan(800);
    for (let s = 0; s < network.segmentCount; s++) {
      expect(network.segmentLength[s]).toBeGreaterThan(0);
      expect(network.segmentLength[s]).toBeLessThan(1_000);
    }
  });

  it('gives cars fewer usable edges than pedestrians, who ignore one-way streets', () => {
    const car = routingGraph(network, 'car', 'shortest').graph;
    const walk = routingGraph(network, 'walk', 'shortest').graph;
    expect(car.edgeCount).toBeLessThan(walk.edgeCount);
  });

  it.each(modes)('finds a %s route between the Casa Rosada and the Cabildo', (mode) => {
    const prepared = prepareSearch(network, {
      start: casaRosada,
      target: cabildo,
      mode,
      objective: 'shortest',
    });
    expect(prepared.snapped.start.meters).toBeLessThan(100);
    expect(prepared.snapped.target.meters).toBeLessThan(100);
    const { result } = runSearch(aStar, prepared);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.cost).toBeGreaterThan(250); // ≈ 320 m apart in a straight line
      expect(result.cost).toBeLessThan(2_000);
    }
  });

  it('never gives a car a shorter route than a pedestrian between the same intersections', () => {
    // Node indices are shared by every mode's graph, so snap once (for the car) and reuse them.
    const car = prepareSearch(network, {
      start: casaRosada,
      target: cabildo,
      mode: 'car',
      objective: 'shortest',
    });
    const walk = routingGraph(network, 'walk', 'shortest').graph;
    const byCar = runSearch(dijkstra, car).result;
    const onFoot = runSearch(dijkstra, {
      graph: walk,
      source: car.source,
      target: car.target,
    }).result;
    expect(byCar.found && onFoot.found).toBe(true);
    if (byCar.found && onFoot.found) expect(byCar.cost).toBeGreaterThanOrEqual(onFoot.cost - 1e-6);
  });

  const cases = modes.flatMap((mode) =>
    (['fastest', 'shortest'] as const).map((objective) => ({ mode, objective })),
  );
  describe.each(cases)('$mode, $objective', ({ mode, objective }) => {
    const { graph, maxSpeed } = routingGraph(network, mode, objective);
    const usable = largestStronglyConnectedComponent(graph);
    const nodes = [...usable.keys()].filter((n) => usable[n]);

    it('A* with the straight-line heuristic matches Dijkstra on real streets', () => {
      fc.assert(
        fc.property(fc.constantFrom(...nodes), fc.constantFrom(...nodes), (source, target) => {
          const prepared = prepareSearch(network, {
            start: { lat: graph.lat[source]!, lon: graph.lon[source]! },
            target: { lat: graph.lat[target]!, lon: graph.lon[target]! },
            mode,
            objective,
          });
          expect(prepared.maxSpeed).toBe(maxSpeed);
          const best = runSearch(dijkstra, prepared).result;
          const guided = runSearch(aStar, prepared).result;
          expect(best.found && guided.found).toBe(true);
          if (best.found && guided.found) expect(guided.cost).toBeCloseTo(best.cost, 6);
        }),
        { numRuns: 20 },
      );
    });
  });
});
