import type { Cache } from './cache';
import { loadRoadNetwork } from './load';
import type { OverpassResponse, RoadNetwork } from './network';
import { overpassQuery } from './overpass';

const box = { south: 0, west: 0, north: 0.01, east: 0.01 };
const response: OverpassResponse = {
  elements: [
    { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'residential' } },
    { type: 'node', id: 1, lat: 0, lon: 0 },
    { type: 'node', id: 2, lat: 0, lon: 0.001 },
  ],
};

function memoryCache(): Cache<RoadNetwork> & { entries: Map<string, RoadNetwork> } {
  const entries = new Map<string, RoadNetwork>();
  return {
    entries,
    get: async (key) => entries.get(key),
    set: async (key, value) => void entries.set(key, value),
  };
}

describe('loadRoadNetwork', () => {
  it('downloads the area and remembers the resulting network', async () => {
    const cache = memoryCache();
    const fetchOverpass = vi.fn(async () => response);
    const { network, fromCache } = await loadRoadNetwork(box, { fetchOverpass, cache });
    expect(fromCache).toBe(false);
    expect(network.segmentCount).toBe(1);
    expect(fetchOverpass).toHaveBeenCalledWith(overpassQuery(box), expect.anything());
    expect(cache.entries.size).toBe(1);
  });

  it('uses the remembered network instead of downloading again', async () => {
    const cache = memoryCache();
    const fetchOverpass = vi.fn(async () => response);
    await loadRoadNetwork(box, { fetchOverpass, cache });
    const second = await loadRoadNetwork(box, { fetchOverpass, cache });
    expect(second.fromCache).toBe(true);
    expect(second.network.segmentCount).toBe(1);
    expect(fetchOverpass).toHaveBeenCalledTimes(1);
  });

  it('still returns the network when it cannot be cached', async () => {
    const cache: Cache<RoadNetwork> = {
      get: async () => undefined,
      set: async () => {
        throw new Error('quota exceeded');
      },
    };
    const { network } = await loadRoadNetwork(box, { fetchOverpass: async () => response, cache });
    expect(network.segmentCount).toBe(1);
  });
});
