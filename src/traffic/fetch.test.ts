import { fetchTraffic, recentTraffic } from './fetch';
import type { FetchedTraffic } from './tomtom';

const box = { south: -34.611, west: -58.376, north: -34.605, east: -58.368 };
const sample: FetchedTraffic = {
  readings: [
    {
      line: [
        [0, 0],
        [1, 0],
      ],
      ratio: 0.5,
      closed: false,
    },
  ],
  missingTiles: 0,
};

describe('fetchTraffic', () => {
  it('asks the chosen provider', async () => {
    const tomtom = vi.fn(async () => sample);
    const here = vi.fn(async () => sample);
    await fetchTraffic({ provider: 'here', key: 'k' }, box, { providers: { tomtom, here } });
    expect(here).toHaveBeenCalledWith(box, 'k', expect.anything());
    expect(tomtom).not.toHaveBeenCalled();
  });

  it('reuses a recent answer for the same area, provider and key, to spare the quota', async () => {
    let now = 1_000_000;
    const cache = recentTraffic({ ttlMs: 120_000, now: () => now });
    const tomtom = vi.fn(async () => sample);
    const here = vi.fn(async () => sample);
    const options = { providers: { tomtom, here }, cache };
    const first = await fetchTraffic({ provider: 'tomtom', key: 'k' }, box, options);
    now += 60_000;
    const second = await fetchTraffic({ provider: 'tomtom', key: 'k' }, box, options);
    expect(tomtom).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    // When it was fetched travels with it, so the UI can say how fresh it is.
    expect(second.fetchedAt).toBe(1_000_000);

    await fetchTraffic({ provider: 'tomtom', key: 'other' }, box, options);
    expect(tomtom).toHaveBeenCalledTimes(2);
    now += 120_000;
    await fetchTraffic({ provider: 'tomtom', key: 'k' }, box, options);
    expect(tomtom).toHaveBeenCalledTimes(3);
  });

  it('does not remember failures', async () => {
    const cache = recentTraffic({ ttlMs: 120_000 });
    const tomtom = vi
      .fn<() => Promise<FetchedTraffic>>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(sample);
    const options = { providers: { tomtom, here: tomtom }, cache };
    await expect(fetchTraffic({ provider: 'tomtom', key: 'k' }, box, options)).rejects.toThrow();
    await expect(
      fetchTraffic({ provider: 'tomtom', key: 'k' }, box, options),
    ).resolves.toMatchObject({ readings: sample.readings });
  });
});
