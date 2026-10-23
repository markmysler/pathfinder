import { buildRoadNetwork, routingGraph } from '../osm/network';
import { trafficRoads, trafficStory } from './story';
import type { SegmentTraffic } from './match';

// Two ways from S to T: North Street over N (about 222 m) and South Street over Q (about 249 m),
// with a footpath that cars may not use.
const network = buildRoadNetwork({
  elements: [
    { type: 'node', id: 1, lat: 0, lon: 0 }, // S
    { type: 'node', id: 2, lat: 0.0005, lon: 0.001 }, // N
    { type: 'node', id: 3, lat: 0, lon: 0.002 }, // T
    { type: 'node', id: 4, lat: -0.001, lon: 0.001 }, // Q
    {
      type: 'way',
      id: 10,
      nodes: [1, 2, 3],
      tags: { highway: 'residential', name: 'North Street' },
    },
    {
      type: 'way',
      id: 11,
      nodes: [1, 4, 3],
      tags: { highway: 'residential', name: 'South Street' },
    },
    { type: 'way', id: 12, nodes: [2, 4], tags: { highway: 'footway' } },
  ],
});
// Segments: 0 S–N, 1 N–T, 2 S–Q, 3 Q–T, 4 the footpath N–Q. Nodes: S 0, N 1, T 2, Q 3.
const S = 0;
const T = 2;
const traffic = (forward: number[], backward: number[] = forward): SegmentTraffic => ({
  forward: Float32Array.from(forward),
  backward: Float32Array.from(backward),
  matched: 0,
});

describe('trafficStory', () => {
  it('finds the best route on clear roads, and what it costs now', () => {
    const jam = traffic([0.2, 0.2, NaN, NaN, NaN]);
    const routing = routingGraph(network, 'car', 'fastest', jam);
    const story = trafficStory(network, routing, S, T, 'car', 'fastest')!;
    const clear = routingGraph(network, 'car', 'fastest');
    const northSeconds = clear.graph.edgeWeight[0]! + clear.graph.edgeWeight[2]!;
    expect(story.clear.cost).toBeLessThan(northSeconds + 1e-6);
    // Shares are stored as 32-bit floats, so compare the ratio.
    expect(story.clear.costNow / story.clear.cost).toBeCloseTo(5, 5);
    // Through S, N and T.
    expect(story.clear.positions).toHaveLength(6);
    expect(story.changed).toBe(true);
    expect(story.best).toBeGreaterThan(story.clear.cost);
    expect(story.best).toBeLessThan(story.clear.costNow);
    expect(story.jammed).toEqual({ name: 'North Street', share: expect.closeTo(0.2, 6) });
    expect(story.via).toBe('South Street');
  });

  it('says when traffic slows the route without changing it', () => {
    const slow = traffic([0.8, 0.8, 0.8, 0.8, NaN]);
    const routing = routingGraph(network, 'car', 'fastest', slow);
    const story = trafficStory(network, routing, S, T, 'car', 'fastest')!;
    expect(story.changed).toBe(false);
    expect(story.best).toBeCloseTo(story.clear.costNow, 6);
    expect(story.via).toBeUndefined();
  });

  it('counts a closed road on the clear route as never arriving', () => {
    const closed = traffic([0, NaN, NaN, NaN, NaN], [NaN, NaN, NaN, NaN, NaN]);
    const routing = routingGraph(network, 'car', 'fastest', closed);
    const story = trafficStory(network, routing, S, T, 'car', 'fastest')!;
    expect(story.clear.costNow).toBe(Infinity);
    expect(story.jammed).toEqual({ name: 'North Street', share: 0 });
    expect(story.changed).toBe(true);
  });

  it('has nothing to say without a route', () => {
    const closed = traffic([0, 0, 0, 0, NaN]);
    const routing = routingGraph(network, 'car', 'fastest', closed);
    expect(trafficStory(network, routing, S, T, 'car', 'fastest')).toBeUndefined();
  });
});

describe('trafficRoads', () => {
  it('lists the car roads that are slow or closed, once each, at their slowest direction', () => {
    const roads = trafficRoads(network, traffic([0.5, 1, 0, NaN, 0.1], [0.9, 0.3, NaN, NaN, 0.1]));
    // S–N slow (0.5), N–T slow one way (0.3), S–Q closed; Q–T has no reading; the footpath is not
    // for cars.
    expect(Array.from(roads.share)).toEqual([0.5, expect.closeTo(0.3, 6), 0]);
    expect(roads.positions).toHaveLength(12);
    expect(Array.from(roads.positions.slice(0, 4))).toEqual([0, 0, 0.001, 0.0005]);
  });
});
