import { graphFrom } from '../test/fixtures';
import { haversineMeters } from './geo';
import { nearestNode } from './nearest';

const graph = graphFrom([], {
  coords: [
    [0, 0],
    [0, 0.01],
    [0.01, 0.01],
  ],
});

describe('nearestNode', () => {
  it('finds the closest node and how far away it is', () => {
    expect(nearestNode(graph, 0.0001, 0.0099)).toEqual({
      node: 1,
      meters: haversineMeters(0.0001, 0.0099, 0, 0.01),
    });
  });

  it('only considers allowed nodes', () => {
    const allowed = Uint8Array.from([1, 0, 1]);
    expect(nearestNode(graph, 0.0001, 0.0099, allowed)?.node).toBe(2);
  });

  it('returns null when there is nothing to snap to', () => {
    expect(nearestNode(graph, 0, 0, new Uint8Array(3))).toBeNull();
    expect(nearestNode(graphFrom([]), 0, 0)).toBeNull();
  });
});
