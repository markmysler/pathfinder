import { haversineMeters } from '../graph/geo';
import { fetchHere, hereFlowUrl, readHereFlow, type HereFlowResponse } from './here';

// A street heading east, about 180 m long, in two links.
const points = [
  { lat: -34.6085, lng: -58.374 },
  { lat: -34.6085, lng: -58.373 },
  { lat: -34.6085, lng: -58.372 },
];
const length = haversineMeters(-34.6085, -58.374, -34.6085, -58.372);

function response(flow: HereFlowResponse['results'][number]['currentFlow']): HereFlowResponse {
  return {
    results: [
      {
        location: {
          length,
          shape: { links: [{ points: points.slice(0, 2) }, { points: points.slice(1) }] },
        },
        currentFlow: flow,
      },
    ],
  };
}

describe('readHereFlow', () => {
  it('turns a flow item into one reading along its whole shape', () => {
    const [reading, ...rest] = readHereFlow(
      response({ speed: 5, freeFlow: 10, jamFactor: 4, traversability: 'open' }),
    );
    expect(rest).toEqual([]);
    expect(reading!.ratio).toBeCloseTo(0.5, 6);
    expect(reading!.closed).toBe(false);
    // The shared point between links appears once.
    expect(reading!.line).toEqual([
      [-58.374, -34.6085],
      [-58.373, -34.6085],
      [-58.372, -34.6085],
    ]);
  });

  it('splits the shape where sub-segments with their own speeds begin', () => {
    const readings = readHereFlow(
      response({
        speed: 6,
        freeFlow: 10,
        jamFactor: 3,
        traversability: 'open',
        subSegments: [
          { length: length / 4, speed: 2, freeFlow: 10, jamFactor: 8, traversability: 'open' },
          {
            length: (3 * length) / 4,
            speed: 8,
            freeFlow: 10,
            jamFactor: 1,
            traversability: 'open',
          },
        ],
      }),
    );
    expect(readings.map((r) => r.ratio)).toEqual([0.2, 0.8]);
    // The split falls a quarter of the way along, between the first two points.
    const cut = readings[0]!.line.at(-1)!;
    expect(cut[0]).toBeCloseTo(-58.3735, 4);
    expect(readings[1]!.line[0]).toEqual(cut);
    expect(readings[1]!.line.at(-1)).toEqual([-58.372, -34.6085]);
  });

  it('marks closed roads, and caps speeds above free flow at 1', () => {
    const [closed] = readHereFlow(
      response({ speed: 0, freeFlow: 10, jamFactor: 10, traversability: 'closed' }),
    );
    expect(closed!.closed).toBe(true);
    const [fast] = readHereFlow(
      response({ speed: 14, freeFlow: 10, jamFactor: 0, traversability: 'open' }),
    );
    expect(fast!.ratio).toBe(1);
  });

  it('skips items with no usable speed', () => {
    expect(readHereFlow(response({ speed: 5, freeFlow: 0, jamFactor: 1 }))).toEqual([]);
    expect(readHereFlow({ results: [] })).toEqual([]);
  });
});

describe('hereFlowUrl', () => {
  it('asks for the flow in the box with shapes, and the key in the query', () => {
    const url = new URL(
      hereFlowUrl({ south: -34.611, west: -58.376, north: -34.605, east: -58.368 }, 'my key'),
    );
    expect(url.origin + url.pathname).toBe('https://data.traffic.hereapi.com/v7/flow');
    expect(url.searchParams.get('in')).toBe('bbox:-58.376,-34.611,-58.368,-34.605');
    expect(url.searchParams.get('locationReferencing')).toBe('shape');
    expect(url.searchParams.get('apiKey')).toBe('my key');
  });
});

describe('fetchHere', () => {
  const box = { south: -34.611, west: -58.376, north: -34.605, east: -58.368 };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('reads the flow for the whole area in one request', async () => {
    const fetch = vi.fn(async () =>
      json(response({ speed: 5, freeFlow: 10, jamFactor: 4, traversability: 'open' })),
    );
    const progress = vi.fn();
    const { readings, missingTiles } = await fetchHere(box, 'k', { fetch, onProgress: progress });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(readings).toHaveLength(1);
    expect(missingTiles).toBe(0);
    expect(progress).toHaveBeenLastCalledWith(1, 1);
  });

  it('says the key was refused on 401 or 403', async () => {
    for (const status of [401, 403]) {
      const fetch = vi.fn(async () => json({ error: 'Unauthorized' }, status));
      await expect(fetchHere(box, 'bad', { fetch })).rejects.toMatchObject({
        provider: 'here',
        reason: 'key',
      });
    }
  });

  it('says the quota is used up on 429', async () => {
    const fetch = vi.fn(async () => json({}, 429));
    await expect(fetchHere(box, 'k', { fetch })).rejects.toMatchObject({ reason: 'quota' });
  });

  it('treats a request the browser could not complete as unavailable', async () => {
    // HERE leaves CORS headers off its 401s, so a wrong key can look like a network failure.
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(fetchHere(box, 'k', { fetch })).rejects.toMatchObject({ reason: 'unavailable' });
  });
});
