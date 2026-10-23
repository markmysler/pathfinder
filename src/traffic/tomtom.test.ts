import { encodeTile } from '../test/vectorTile';
import { fetchTomTom, readTomTomTile, tomTomTileUrl, TOMTOM_ZOOM } from './tomtom';
import { tilesCovering } from './tiles';
import { TrafficError } from './types';

const tile = { z: 14, x: 5535, y: 9872 };
// Two directions of one street near Plaza de Mayo, and a closed road.
const east: [number, number][] = [
  [-58.3725, -34.6085],
  [-58.372, -34.6085],
];
const west: [number, number][] = [
  [-58.372, -34.6085],
  [-58.3725, -34.6085],
];
const closed: [number, number][] = [
  [-58.3722, -34.6081],
  [-58.3722, -34.6079],
];

function sampleTile() {
  return encodeTile('Traffic flow', tile, [
    {
      line: east,
      tags: { road_category: 'street', relative_speed: 0.4, part_of_two_way_road: true },
    },
    {
      line: west,
      tags: { road_category: 'street', relative_speed: 1, part_of_two_way_road: true },
    },
    { line: closed, tags: { road_category: 'street', relative_speed: 0, road_closure: true } },
  ]);
}

describe('readTomTomTile', () => {
  it('turns each flow line into a reading in the direction of travel', () => {
    const readings = readTomTomTile(sampleTile(), tile);
    expect(readings).toHaveLength(3);
    const [first, second, third] = readings;
    expect(first!.ratio).toBeCloseTo(0.4, 6);
    expect(first!.closed).toBe(false);
    // Tile coordinates are rounded to 1/4096 of a tile: well under a metre at zoom 14.
    expect(first!.line[0]![0]).toBeCloseTo(east[0]![0], 4);
    expect(first!.line[0]![1]).toBeCloseTo(east[0]![1], 4);
    expect(first!.line[1]![0]).toBeCloseTo(east[1]![0], 4);
    expect(second!.line[0]![0]).toBeCloseTo(west[0]![0], 4);
    expect(third!.closed).toBe(true);
  });

  it('ignores other layers and features without a speed', () => {
    const bytes = encodeTile('Something else', tile, [{ line: east, tags: { relative_speed: 1 } }]);
    expect(readTomTomTile(bytes, tile)).toEqual([]);
    const noSpeed = encodeTile('Traffic flow', tile, [
      { line: east, tags: { road_category: 'street' } },
    ]);
    expect(readTomTomTile(noSpeed, tile)).toEqual([]);
  });
});

describe('tomTomTileUrl', () => {
  it('asks the Orbis flow tile endpoint with the key in the query, so there is no preflight', () => {
    const url = new URL(tomTomTileUrl(tile, 'my key'));
    expect(url.origin).toBe('https://api.tomtom.com');
    expect(url.pathname).toBe('/maps/orbis/traffic/flow/vector/tile/14/5535/9872');
    expect(url.searchParams.get('apiVersion')).toBe('2');
    expect(url.searchParams.get('key')).toBe('my key');
  });
});

describe('fetchTomTom', () => {
  const box = { south: -34.611, west: -58.376, north: -34.605, east: -58.368 };
  const tileCount = tilesCovering(box, TOMTOM_ZOOM).length;
  const ok = () => new Response(sampleTile().slice().buffer as ArrayBuffer, { status: 200 });

  it('downloads every tile over the area and reports progress', async () => {
    const fetch = vi.fn(async () => ok());
    const progress: [number, number][] = [];
    const { readings, missingTiles } = await fetchTomTom(box, 'k', {
      fetch,
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(fetch).toHaveBeenCalledTimes(tileCount);
    expect(readings).toHaveLength(3 * tileCount);
    expect(missingTiles).toBe(0);
    expect(progress.at(-1)).toEqual([tileCount, tileCount]);
  });

  it('says the key was refused on 403, and stops asking', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 403 }));
    const error = await fetchTomTom(box, 'bad', { fetch }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TrafficError);
    expect(error).toMatchObject({ provider: 'tomtom', reason: 'key' });
  });

  it('says the quota is used up on 429', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 429 }));
    await expect(fetchTomTom(box, 'k', { fetch })).rejects.toMatchObject({ reason: 'quota' });
  });

  it('keeps the tiles that arrived when some fail, and counts the rest', async () => {
    const wide = { ...box, west: -58.39, east: -58.35 };
    const wideCount = tilesCovering(wide, TOMTOM_ZOOM).length;
    expect(wideCount).toBeGreaterThan(1);
    let calls = 0;
    const fetch = vi.fn(async () => (calls++ === 0 ? new Response('', { status: 503 }) : ok()));
    const { readings, missingTiles } = await fetchTomTom(wide, 'k', { fetch });
    expect(missingTiles).toBe(1);
    expect(readings).toHaveLength(3 * (wideCount - 1));
  });

  it('gives up as unavailable when no tile arrives', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(fetchTomTom(box, 'k', { fetch })).rejects.toMatchObject({
      reason: 'unavailable',
    });
  });

  it('passes cancellation through instead of treating it as a failure', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn(async () => ok());
    await expect(fetchTomTom(box, 'k', { fetch, signal: controller.signal })).rejects.toMatchObject(
      { name: 'AbortError' },
    );
  });
});
