import { activeSource, checkKey, loadTrafficSettings, saveTrafficSettings } from './settings';
import { TrafficError } from './types';

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

describe('traffic settings', () => {
  it('starts with no keys and traffic off', () => {
    expect(loadTrafficSettings(memoryStorage())).toEqual({ provider: null, keys: {} });
  });

  it("keeps each provider's key and which one is on, in this browser's storage", () => {
    const storage = memoryStorage();
    saveTrafficSettings({ provider: 'here', keys: { tomtom: 't-key', here: 'h-key' } }, storage);
    expect(loadTrafficSettings(storage)).toEqual({
      provider: 'here',
      keys: { tomtom: 't-key', here: 'h-key' },
    });
  });

  it('survives storage that is missing, broken or blocked', () => {
    const broken = memoryStorage();
    broken.setItem('pathfinder.traffic', '{not json');
    expect(loadTrafficSettings(broken)).toEqual({ provider: null, keys: {} });
    const blocked = {
      ...memoryStorage(),
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    } as Storage;
    expect(loadTrafficSettings(blocked)).toEqual({ provider: null, keys: {} });
    expect(() => saveTrafficSettings({ provider: null, keys: {} }, blocked)).not.toThrow();
    expect(loadTrafficSettings(undefined)).toEqual({ provider: null, keys: {} });
  });

  it('ignores stored values that are not a provider or not a key', () => {
    const storage = memoryStorage();
    storage.setItem(
      'pathfinder.traffic',
      JSON.stringify({ provider: 'google', keys: { tomtom: 42, here: ' h ' } }),
    );
    expect(loadTrafficSettings(storage)).toEqual({ provider: null, keys: { here: 'h' } });
  });
});

describe('activeSource', () => {
  it('is the chosen provider with its key, or nothing', () => {
    expect(activeSource({ provider: 'tomtom', keys: { tomtom: 'k' } })).toEqual({
      provider: 'tomtom',
      key: 'k',
    });
    expect(activeSource({ provider: 'tomtom', keys: { here: 'k' } })).toBeUndefined();
    expect(activeSource({ provider: null, keys: { tomtom: 'k' } })).toBeUndefined();
  });
});

describe('checkKey', () => {
  it('asks the provider for a small area and says the key works', async () => {
    const fetchTraffic = vi.fn(async () => ({ readings: [], missingTiles: 0, fetchedAt: 0 }));
    await expect(checkKey({ provider: 'tomtom', key: 'k' }, { fetchTraffic })).resolves.toEqual({
      ok: true,
    });
    const [, area] = fetchTraffic.mock.calls[0] as unknown as [
      unknown,
      { north: number; south: number },
    ];
    expect(area.north - area.south).toBeLessThan(0.02);
  });

  it('passes on why a key failed', async () => {
    const fetchTraffic = vi.fn(async () => {
      throw new TrafficError('here', 'key', 'refused');
    });
    await expect(checkKey({ provider: 'here', key: 'k' }, { fetchTraffic })).resolves.toEqual({
      ok: false,
      reason: 'key',
    });
    const odd = vi.fn(async () => {
      throw new Error('?');
    });
    await expect(checkKey({ provider: 'here', key: 'k' }, { fetchTraffic: odd })).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });
});
