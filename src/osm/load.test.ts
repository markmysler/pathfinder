import type { Cache } from './cache';
import { loadRoadNetwork, NotSavedError } from './load';
import { savedAreas } from './saved';
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
    delete: async (key) => void entries.delete(key),
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
      delete: async () => undefined,
      get: async () => undefined,
      set: async () => {
        throw new Error('quota exceeded');
      },
    };
    const { network } = await loadRoadNetwork(box, { fetchOverpass: async () => response, cache });
    expect(network.segmentCount).toBe(1);
  });

  it('passes on which server is being tried', async () => {
    const onAttempt = vi.fn();
    await loadRoadNetwork(box, {
      fetchOverpass: async (_query, options) => {
        options.onAttempt?.('https://maps.mail.ru/osm/tools/overpass/api/interpreter', 1);
        return response;
      },
      onAttempt,
    });
    expect(onAttempt).toHaveBeenCalledWith(
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      1,
    );
  });
});

describe('loadRoadNetwork with saved areas', () => {
  const route = {
    start: { name: 'Casa Rosada', lat: 0.002, lon: 0.002 },
    target: { name: 'Cabildo', lat: 0.008, lon: 0.008 },
  };
  const setup = () => {
    const cache = memoryCache();
    const index = new Map<string, unknown>();
    const saved = savedAreas({
      index: {
        get: async (key) => index.get(key) as never,
        set: async (key, value) => void index.set(key, value),
        delete: async (key) => void index.delete(key),
      },
      roads: cache,
      keepMs: 7 * 24 * 60 * 60 * 1000,
    });
    return { cache, saved };
  };

  it('records each area it downloads, with the route that asked for it', async () => {
    const { cache, saved } = setup();
    await loadRoadNetwork(box, { fetchOverpass: async () => response, cache, saved, route });
    expect(await saved.list()).toEqual([
      expect.objectContaining({ box, start: route.start, target: route.target }),
    ]);
  });

  it('offline, runs inside a saved area on its streets', async () => {
    const { cache, saved } = setup();
    await loadRoadNetwork(box, { fetchOverpass: async () => response, cache, saved, route });
    const inside = { south: 0.002, west: 0.002, north: 0.008, east: 0.008 };
    const fetchOverpass = vi.fn(async () => response);
    const { network, fromCache } = await loadRoadNetwork(inside, {
      fetchOverpass,
      cache,
      saved,
      offline: true,
    });
    expect(fromCache).toBe(true);
    expect(network.segmentCount).toBe(1);
    expect(fetchOverpass).not.toHaveBeenCalled();
  });

  it('falls back on a saved area when the download fails', async () => {
    const { cache, saved } = setup();
    await loadRoadNetwork(box, { fetchOverpass: async () => response, cache, saved, route });
    const inside = { south: 0.002, west: 0.002, north: 0.008, east: 0.008 };
    const failing = async () => {
      throw new Error('Overpass is down');
    };
    const { fromCache } = await loadRoadNetwork(inside, { fetchOverpass: failing, cache, saved });
    expect(fromCache).toBe(true);
  });

  it('lets a saved area stand in when it holds A and B, though not all the margin around them', async () => {
    const { cache, saved } = setup();
    await loadRoadNetwork(box, { fetchOverpass: async () => response, cache, saved, route });
    const wider = { south: -0.005, west: -0.005, north: 0.015, east: 0.015 };
    const ends = { south: 0.001, west: 0.001, north: 0.009, east: 0.009 };
    const offline = { cache, saved, offline: true };
    await expect(loadRoadNetwork(wider, offline)).rejects.toBeInstanceOf(NotSavedError);
    const loaded = await loadRoadNetwork(wider, { ...offline, ends });
    expect(loaded).toMatchObject({ fromCache: true, box });
  });

  it('offline, with no saved area around, says these streets are not on the device', async () => {
    const { cache, saved } = setup();
    await expect(
      loadRoadNetwork(box, { fetchOverpass: async () => response, cache, saved, offline: true }),
    ).rejects.toBeInstanceOf(NotSavedError);
  });
});
