import { buildRoadNetwork, type OverpassResponse } from './network';
import { NoRoadNearbyError, prepareSearch } from './prepare';

// Two-way street 1-2-3, plus a one-way spur 3→4 that cars can enter but never leave.
const response: OverpassResponse = {
  elements: [
    { type: 'way', id: 10, nodes: [1, 2, 3], tags: { highway: 'residential' } },
    { type: 'way', id: 11, nodes: [3, 4], tags: { highway: 'residential', oneway: 'yes' } },
    { type: 'node', id: 1, lat: 0, lon: 0 },
    { type: 'node', id: 2, lat: 0, lon: 0.001 },
    { type: 'node', id: 3, lat: 0, lon: 0.002 },
    { type: 'node', id: 4, lat: 0, lon: 0.003 },
  ],
};
const network = buildRoadNetwork(response);

describe('prepareSearch', () => {
  it('snaps start and destination to the nearest usable intersections', () => {
    const prepared = prepareSearch(network, {
      start: { lat: 0.0001, lon: 0.0001 },
      target: { lat: 0.0001, lon: 0.0019 },
      mode: 'car',
      objective: 'shortest',
    });
    expect(prepared.source).toBe(0);
    expect(prepared.target).toBe(2);
    expect(prepared.snapped.start.meters).toBeGreaterThan(0);
  });

  it('never snaps a car to a dead end it could not drive out of', () => {
    const prepared = prepareSearch(network, {
      start: { lat: 0, lon: 0 },
      target: { lat: 0, lon: 0.003 },
      mode: 'car',
      objective: 'shortest',
    });
    expect(prepared.target).toBe(2);
  });

  it('lets a pedestrian reach the end of the one-way spur', () => {
    const prepared = prepareSearch(network, {
      start: { lat: 0, lon: 0 },
      target: { lat: 0, lon: 0.003 },
      mode: 'walk',
      objective: 'shortest',
    });
    expect(prepared.target).toBe(3);
  });

  it('builds a heuristic in the same units as the edge weights', () => {
    const fastest = prepareSearch(network, {
      start: { lat: 0, lon: 0 },
      target: { lat: 0, lon: 0.002 },
      mode: 'car',
      objective: 'fastest',
    });
    // Straight-line meters divided by the 30 km/h residential speed gives seconds.
    expect(fastest.heuristic(0)).toBeCloseTo(fastest.graph.edgeWeight[0]! * 2, 6);
  });

  it('fails clearly when the area has no roads for this mode', () => {
    const empty = buildRoadNetwork({ elements: [] });
    expect(() =>
      prepareSearch(empty, {
        start: { lat: 0, lon: 0 },
        target: { lat: 0, lon: 0.001 },
        mode: 'car',
        objective: 'fastest',
      }),
    ).toThrow(NoRoadNearbyError);
  });

  it('fails clearly when the only roads are ones this mode cannot use', () => {
    const footpaths = buildRoadNetwork({
      elements: [
        { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'footway' } },
        { type: 'node', id: 1, lat: 0, lon: 0 },
        { type: 'node', id: 2, lat: 0, lon: 0.001 },
      ],
    });
    const request = { start: { lat: 0, lon: 0 }, target: { lat: 0, lon: 0.001 } };
    expect(() =>
      prepareSearch(footpaths, { ...request, mode: 'car', objective: 'fastest' }),
    ).toThrow(NoRoadNearbyError);
    expect(
      prepareSearch(footpaths, { ...request, mode: 'walk', objective: 'fastest' }).target,
    ).toBe(1);
  });
});
