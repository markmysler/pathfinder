import {
  DEFAULT_ENDPOINTS,
  fetchOverpass,
  OverpassError,
  overpassQuery,
  ROAD_TYPES,
} from './overpass';
import { allowedDirections } from './roads';

const box = { south: -34.615, west: -58.39, north: -34.595, east: -58.365 };
const okBody = { elements: [{ type: 'node', id: 1, lat: 0, lon: 0 }] };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeFetch(...responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error || next instanceof DOMException) throw next;
    return next;
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

describe('overpassQuery', () => {
  const query = overpassQuery(box);

  it('asks for JSON road ways inside the box, south-west-north-east', () => {
    expect(query).toContain('[out:json][timeout:60]');
    expect(query).toContain('(-34.615,-58.39,-34.595,-58.365)');
  });

  it('fetches the ways with tags and their nodes with coordinates only', () => {
    expect(query).toMatch(/out body qt;\s*>;\s*out skel qt;/);
  });

  it('requests every kind of road some travel mode can use', () => {
    const candidates = [
      ...ROAD_TYPES,
      'footway',
      'cycleway',
      'bridleway',
      'steps',
      'pedestrian',
      'construction',
      'proposed',
      'platform',
      'bus_stop',
      'corridor',
      'elevator',
      'raceway',
    ];
    for (const highway of candidates) {
      const usable = (['car', 'bike', 'walk'] as const).some(
        (mode) => allowedDirections({ highway, bicycle: 'yes', foot: 'yes' }, mode) !== null,
      );
      expect({ highway, requested: ROAD_TYPES.includes(highway) }).toEqual({
        highway,
        requested: usable,
      });
    }
  });
});

describe('fetchOverpass', () => {
  it('posts the query to the first endpoint and returns the parsed response', async () => {
    const { fetch, calls } = fakeFetch(json(okBody));
    await expect(fetchOverpass('QUERY', { fetch })).resolves.toEqual(okBody);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(DEFAULT_ENDPOINTS[0]);
    expect(calls[0]!.init?.method).toBe('POST');
    expect(String(calls[0]!.init?.body)).toBe('data=QUERY');
  });

  it('moves on to the next endpoint when one is busy, down or broken', async () => {
    for (const failure of [
      json({}, 429),
      json({}, 504),
      new TypeError('network down'),
      new Response('<html>oops</html>', { status: 200 }),
      json({ elements: [], remark: 'runtime error: Query timed out in "query" at line 3' }),
    ]) {
      const { fetch, calls } = fakeFetch(failure, json(okBody));
      await expect(fetchOverpass('QUERY', { fetch })).resolves.toEqual(okBody);
      expect(calls.map((c) => c.url)).toEqual(DEFAULT_ENDPOINTS.slice(0, 2));
    }
  });

  it('gives up with every reason when all endpoints fail', async () => {
    const { fetch } = fakeFetch(json({}, 429), json({}, 503));
    const error = await fetchOverpass('QUERY', { fetch }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OverpassError);
    expect((error as OverpassError).attempts.map((a) => a.endpoint)).toEqual(DEFAULT_ENDPOINTS);
    expect((error as OverpassError).message).toMatch(/429/);
  });

  it('does not retry a query the server rejected as invalid', async () => {
    const { fetch, calls } = fakeFetch(new Response('syntax error', { status: 400 }));
    await expect(fetchOverpass('QUERY', { fetch })).rejects.toBeInstanceOf(OverpassError);
    expect(calls).toHaveLength(1);
  });

  it('sends nothing when the caller has already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const { fetch, calls } = fakeFetch(json(okBody));
    await expect(
      fetchOverpass('QUERY', { fetch, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toHaveLength(0);
  });

  it('stops without trying other endpoints when cancelled mid-request', async () => {
    const controller = new AbortController();
    const { fetch, calls } = fakeFetch(new DOMException('Aborted', 'AbortError'), json(okBody));
    await expect(
      fetchOverpass('QUERY', { fetch, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toHaveLength(1);
  });

  it('tries three public servers, starting with the main instance', () => {
    expect(DEFAULT_ENDPOINTS).toEqual([
      'https://overpass-api.de/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      'https://overpass.private.coffee/api/interpreter',
    ]);
  });

  it('gives up on a server that takes too long and tries the next', async () => {
    const calls: string[] = [];
    const fetch = (async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (calls.length > 1) return json(okBody);
      return new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)),
      );
    }) as typeof globalThis.fetch;
    await expect(fetchOverpass('QUERY', { fetch, attemptTimeoutMs: 20 })).resolves.toEqual(okBody);
    expect(calls).toEqual(DEFAULT_ENDPOINTS.slice(0, 2));
  });

  it('reports each server it tries', async () => {
    const { fetch } = fakeFetch(json({}, 502), json(okBody));
    const onAttempt = vi.fn();
    await fetchOverpass('QUERY', { fetch, onAttempt });
    expect(onAttempt.mock.calls).toEqual([
      [DEFAULT_ENDPOINTS[0], 0],
      [DEFAULT_ENDPOINTS[1], 1],
    ]);
  });
});
