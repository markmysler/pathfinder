import type { Cache } from './cache';
import { savedAreas, type SavedArea } from './saved';

function memoryCache<T>(): Cache<T> & { entries: Map<string, T> } {
  const entries = new Map<string, T>();
  return {
    entries,
    get: async (key) => entries.get(key),
    set: async (key, value) => void entries.set(key, value),
    delete: async (key) => void entries.delete(key),
  };
}

const day = 24 * 60 * 60 * 1000;
const place = (name: string, lat: number, lon: number) => ({ name, lat, lon });

function area(key: string, box: SavedArea['box'], savedAt: number): SavedArea {
  return {
    key,
    box,
    savedAt,
    bytes: 1000,
    start: place('Casa Rosada', box.south, box.west),
    target: place('Cabildo', box.north, box.east),
  };
}

describe('savedAreas', () => {
  let now = 10 * day;
  const setup = () => {
    const roads = memoryCache<unknown>();
    const saved = savedAreas({ index: memoryCache(), roads, keepMs: 7 * day, now: () => now });
    return { roads, saved };
  };
  beforeEach(() => {
    now = 10 * day;
  });

  it('lists the areas saved, most recently used first', async () => {
    const { saved } = setup();
    await saved.save(area('a', { south: 0, west: 0, north: 1, east: 1 }, now - day));
    await saved.save(area('b', { south: 2, west: 2, north: 3, east: 3 }, now));
    expect((await saved.list()).map((a) => a.key)).toEqual(['b', 'a']);
  });

  it('keeps an area a week after it was last used, then forgets it and its streets', async () => {
    const { saved, roads } = setup();
    await roads.set('a', 'streets');
    await saved.save(area('a', { south: 0, west: 0, north: 1, east: 1 }, now));
    now += 6 * day;
    await saved.touch('a');
    now += 6 * day;
    expect(await saved.list()).toHaveLength(1);
    now += 2 * day;
    expect(await saved.list()).toEqual([]);
    expect(roads.entries.has('a')).toBe(false);
  });

  it('finds the smallest saved area around a box, if any', async () => {
    const { saved } = setup();
    await saved.save(area('big', { south: 0, west: 0, north: 10, east: 10 }, now));
    await saved.save(area('small', { south: 1, west: 1, north: 4, east: 4 }, now));
    expect((await saved.containing({ south: 2, west: 2, north: 3, east: 3 }))?.key).toBe('small');
    expect((await saved.containing({ south: 2, west: 2, north: 6, east: 6 }))?.key).toBe('big');
    expect(await saved.containing({ south: 9, west: 9, north: 11, east: 11 })).toBeUndefined();
  });

  it('forgets an area on request, with its streets', async () => {
    const { saved, roads } = setup();
    await roads.set('a', 'streets');
    await saved.save(area('a', { south: 0, west: 0, north: 1, east: 1 }, now));
    await saved.forget('a');
    expect(await saved.list()).toEqual([]);
    expect(roads.entries.has('a')).toBe(false);
  });

  it('saving the same streets again replaces their entry', async () => {
    const { saved } = setup();
    await saved.save(area('a', { south: 0, west: 0, north: 1, east: 1 }, now - day));
    await saved.save(area('a', { south: 0, west: 0, north: 1, east: 1 }, now));
    expect(await saved.list()).toEqual([expect.objectContaining({ key: 'a', savedAt: now })]);
  });
});
