import { edgeRange, type Graph } from '../graph/graph';
import { haversineMeters } from '../graph/geo';
import { buildRoadNetwork, routingGraph, type OverpassResponse } from './network';

type NodeRow = [id: number, lat: number, lon: number];
type WayRow = [id: number, nodes: number[], tags: Record<string, string>];

const overpass = (nodes: NodeRow[], ways: WayRow[]): OverpassResponse => ({
  elements: [
    ...ways.map(([id, nodeIds, tags]) => ({ type: 'way' as const, id, nodes: nodeIds, tags })),
    ...nodes.map(([id, lat, lon]) => ({ type: 'node' as const, id, lat, lon })),
  ],
});

// A T-junction: a two-way street 1-2-3 and a one-way street 2→4 off its middle.
const junction = overpass(
  [
    [1, 0, 0],
    [2, 0, 0.001],
    [3, 0, 0.002],
    [4, 0.001, 0.001],
    [99, 1, 1], // not part of any road
  ],
  [
    [10, [1, 2, 3], { highway: 'residential', maxspeed: '30' }],
    [11, [2, 4], { highway: 'residential', oneway: 'yes', maxspeed: '20' }],
    [12, [99, 1], { building: 'yes' }],
  ],
);

function edges(graph: Graph) {
  const result: [number, number, number][] = [];
  for (let node = 0; node < graph.nodeCount; node++) {
    const [start, end] = edgeRange(graph, node);
    for (let e = start; e < end; e++) {
      result.push([node, graph.edgeTarget[e]!, graph.edgeWeight[e]!]);
    }
  }
  return result;
}

describe('buildRoadNetwork', () => {
  it('keeps only nodes that belong to roads, merging shared intersections', () => {
    const network = buildRoadNetwork(junction);
    expect(network.nodeCount).toBe(4);
    expect([...network.osmId]).toEqual([1, 2, 3, 4]);
    expect(network.lat[3]).toBe(0.001);
    expect(network.lon[3]).toBe(0.001);
  });

  it('splits each road into segments between consecutive nodes, measured in meters', () => {
    const network = buildRoadNetwork(junction);
    expect(network.segmentCount).toBe(3);
    expect([...network.segmentFrom]).toEqual([0, 1, 1]);
    expect([...network.segmentTo]).toEqual([1, 2, 3]);
    expect(network.segmentLength[0]).toBeCloseTo(haversineMeters(0, 0, 0, 0.001), 6);
    expect(network.wayTags[network.segmentWay[2]!]).toMatchObject({ oneway: 'yes' });
  });

  it('skips segments whose nodes are missing or repeated', () => {
    const network = buildRoadNetwork(
      overpass(
        [
          [1, 0, 0],
          [2, 0, 0.001],
        ],
        [[10, [1, 1, 2, 3], { highway: 'residential' }]],
      ),
    );
    expect(network.segmentCount).toBe(1);
    expect(network.nodeCount).toBe(2);
  });

  it('ignores ways no travel mode can use', () => {
    const network = buildRoadNetwork(
      overpass(
        [
          [1, 0, 0],
          [2, 0, 0.001],
        ],
        [[10, [1, 2], { highway: 'construction' }]],
      ),
    );
    expect(network.segmentCount).toBe(0);
    expect(network.nodeCount).toBe(0);
  });
});

describe('routingGraph', () => {
  const network = buildRoadNetwork(junction);
  const length = (segment: number) => network.segmentLength[segment]!;

  it('weighs roads by length for the shortest route', () => {
    const { graph } = routingGraph(network, 'car', 'shortest');
    expect(edges(graph)).toEqual([
      [0, 1, length(0)],
      [1, 0, length(0)],
      [1, 2, length(1)],
      [1, 3, length(2)],
      [2, 1, length(1)],
    ]);
  });

  it('weighs roads by travel time in seconds for the fastest route', () => {
    const { graph } = routingGraph(network, 'car', 'fastest');
    const oneWayEdge = edges(graph).find(([from, to]) => from === 1 && to === 3)!;
    expect(oneWayEdge[2]).toBeCloseTo(length(2) / (20 / 3.6), 9);
  });

  it('lets people walk both ways down one-way streets', () => {
    const { graph } = routingGraph(network, 'walk', 'shortest');
    expect(edges(graph).some(([from, to]) => from === 3 && to === 1)).toBe(true);
  });

  it('keeps every network node so results map back to coordinates', () => {
    const footpath = buildRoadNetwork(
      overpass(
        [
          [1, 0, 0],
          [2, 0, 0.001],
          [3, 0, 0.002],
        ],
        [
          [10, [1, 2], { highway: 'residential' }],
          [11, [2, 3], { highway: 'footway' }],
        ],
      ),
    );
    const { graph } = routingGraph(footpath, 'car', 'shortest');
    expect(graph.nodeCount).toBe(3);
    expect(graph.edgeCount).toBe(2);
    expect(graph.lat[2]).toBe(0);
    expect(graph.lon[2]).toBe(0.002);
  });

  it('reports the top speed so a time heuristic never overestimates', () => {
    expect(routingGraph(network, 'car', 'fastest').maxSpeed).toBeCloseTo(30 / 3.6, 9);
    expect(routingGraph(network, 'walk', 'fastest').maxSpeed).toBeCloseTo(5 / 3.6, 9);
    expect(routingGraph(network, 'car', 'shortest').maxSpeed).toBe(1);
  });

  describe('with live traffic', () => {
    // Segments: 0 is node 0–1, 1 is node 1–2, 2 is the one-way 1→3.
    const traffic = (forward: number[], backward: number[]) => ({
      forward: Float32Array.from(forward),
      backward: Float32Array.from(backward),
      matched: 0,
    });

    it('slows each direction of a car road by its own traffic, for the fastest route', () => {
      const { graph } = routingGraph(
        network,
        'car',
        'fastest',
        traffic([0.5, NaN, 0.25], [1, NaN, NaN]),
      );
      const weight = (from: number, to: number) =>
        edges(graph).find(([a, b]) => a === from && b === to)![2];
      const usual = (segment: number, kmh: number) => length(segment) / (kmh / 3.6);
      expect(weight(0, 1)).toBeCloseTo(usual(0, 30) / 0.5, 9);
      expect(weight(1, 0)).toBeCloseTo(usual(0, 30), 9);
      // No reading: the usual speed.
      expect(weight(1, 2)).toBeCloseTo(usual(1, 30), 9);
      expect(weight(1, 3)).toBeCloseTo(usual(2, 20) / 0.25, 9);
    });

    it('records the traffic on each edge, in graph order, for explaining it later', () => {
      const { graph, edgeTraffic } = routingGraph(
        network,
        'car',
        'fastest',
        traffic([0.5, NaN, 0.25], [1, NaN, NaN]),
      );
      const at = (from: number, to: number) =>
        edgeTraffic![edges(graph).findIndex(([a, b]) => a === from && b === to)];
      expect(at(0, 1)).toBe(0.5);
      expect(at(1, 0)).toBe(1);
      expect(at(1, 2)).toBeNaN();
      expect(at(1, 3)).toBe(0.25);
    });

    it('drops closed directions, whatever the objective', () => {
      for (const objective of ['fastest', 'shortest'] as const) {
        const { graph } = routingGraph(
          network,
          'car',
          objective,
          traffic([0, NaN, NaN], [1, 0, NaN]),
        );
        const pairs = edges(graph).map(([a, b]) => `${a}-${b}`);
        expect(pairs).not.toContain('0-1');
        expect(pairs).not.toContain('2-1');
        expect(pairs).toContain('1-0');
        expect(pairs).toContain('1-2');
      }
    });

    it("leaves the shortest route's lengths alone, and other modes alone", () => {
      const slow = traffic([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);
      expect(edges(routingGraph(network, 'car', 'shortest', slow).graph)).toEqual(
        edges(routingGraph(network, 'car', 'shortest').graph),
      );
      expect(edges(routingGraph(network, 'walk', 'fastest', slow).graph)).toEqual(
        edges(routingGraph(network, 'walk', 'fastest').graph),
      );
      expect(routingGraph(network, 'walk', 'fastest', slow).edgeTraffic).toBeUndefined();
    });

    it('keeps the top speed an upper bound, so A* stays exact', () => {
      const slow = traffic([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);
      expect(routingGraph(network, 'car', 'fastest', slow).maxSpeed).toBeCloseTo(15 / 3.6, 9);
    });
  });
});
