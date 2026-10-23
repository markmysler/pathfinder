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
});
