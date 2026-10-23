// @vitest-environment node
import { IDBFactory } from 'fake-indexeddb';
import { indexedDbCache } from './cache';

describe('indexedDbCache', () => {
  const day = 24 * 60 * 60 * 1000;
  let indexedDB: IDBFactory;
  beforeEach(() => {
    indexedDB = new IDBFactory();
  });

  it('misses for keys never stored', async () => {
    const cache = indexedDbCache({ name: 'test', ttlMs: day, indexedDB });
    await expect(cache.get('nope')).resolves.toBeUndefined();
  });

  it('returns what was stored, typed arrays included', async () => {
    const cache = indexedDbCache<{ lat: Float64Array }>({ name: 'test', ttlMs: day, indexedDB });
    await cache.set('area', { lat: Float64Array.from([1.5, -2.5]) });
    const hit = await cache.get('area');
    expect(hit?.lat).toBeInstanceOf(Float64Array);
    expect([...hit!.lat]).toEqual([1.5, -2.5]);
  });

  it('survives being reopened, like a page reload', async () => {
    await indexedDbCache({ name: 'test', ttlMs: day, indexedDB }).set('area', 42);
    await expect(indexedDbCache({ name: 'test', ttlMs: day, indexedDB }).get('area')).resolves.toBe(
      42,
    );
  });

  it('forgets entries older than the time to live', async () => {
    let now = 1_000;
    const cache = indexedDbCache({ name: 'test', ttlMs: day, indexedDB, now: () => now });
    await cache.set('area', 'roads');
    now += day - 1;
    await expect(cache.get('area')).resolves.toBe('roads');
    now += 2;
    await expect(cache.get('area')).resolves.toBeUndefined();
  });

  it('quietly does nothing when IndexedDB is unavailable', async () => {
    const cache = indexedDbCache({ name: 'test', ttlMs: day, indexedDB: undefined });
    await expect(cache.set('area', 1)).resolves.toBeUndefined();
    await expect(cache.get('area')).resolves.toBeUndefined();
  });

  it('quietly does nothing when opening the database fails', async () => {
    const broken = {
      open: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    } as unknown as IDBFactory;
    const cache = indexedDbCache({ name: 'test', ttlMs: day, indexedDB: broken });
    await expect(cache.set('area', 1)).resolves.toBeUndefined();
    await expect(cache.get('area')).resolves.toBeUndefined();
  });
});
