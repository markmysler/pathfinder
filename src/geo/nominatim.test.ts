import { createNominatim, GeocodeError } from './nominatim';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function setup(...responses: Response[]) {
  const urls: string[] = [];
  let clock = 0;
  const waits: number[] = [];
  const nominatim = createNominatim({
    fetch: (async (url: string) => {
      urls.push(url);
      return responses.shift() ?? json([]);
    }) as typeof fetch,
    now: () => clock,
    sleep: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
  });
  return { nominatim, urls, waits, advance: (ms: number) => (clock += ms) };
}

const plaza = {
  lat: '-34.6083',
  lon: '-58.3712',
  name: 'Plaza de Mayo',
  display_name: 'Plaza de Mayo, Monserrat, Buenos Aires, Argentina',
};

describe('search', () => {
  it('asks Nominatim for up to five JSON results', async () => {
    const { nominatim, urls } = setup(json([plaza]));
    await nominatim.search('plaza de mayo');
    const url = new URL(urls[0]!);
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(url.searchParams.get('q')).toBe('plaza de mayo');
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(url.searchParams.get('limit')).toBe('5');
  });

  it('turns results into named places with coordinates', async () => {
    const { nominatim } = setup(
      json([plaza, { ...plaza, name: '', display_name: 'Calle 1, Somewhere' }]),
    );
    expect(await nominatim.search('plaza')).toEqual([
      {
        name: 'Plaza de Mayo',
        detail: 'Monserrat, Buenos Aires, Argentina',
        lat: -34.6083,
        lon: -58.3712,
      },
      { name: 'Calle 1', detail: 'Somewhere', lat: -34.6083, lon: -58.3712 },
    ]);
  });

  it('prefers results near a given point', async () => {
    const { nominatim, urls } = setup(json([]));
    await nominatim.search('cabildo', { near: { lat: -34.6, lon: -58.4 } });
    const url = new URL(urls[0]!);
    expect(url.searchParams.get('viewbox')).toBe('-58.5,-34.5,-58.3,-34.7');
    expect(url.searchParams.get('bounded')).toBe('0');
  });

  it('skips the request for blank queries', async () => {
    const { nominatim, urls } = setup();
    expect(await nominatim.search('   ')).toEqual([]);
    expect(urls).toHaveLength(0);
  });

  it('fails clearly when the service errors', async () => {
    const { nominatim } = setup(json({ error: 'busy' }, 503));
    await expect(nominatim.search('plaza')).rejects.toBeInstanceOf(GeocodeError);
  });
});

describe('reverse', () => {
  it('names the place at a point', async () => {
    const { nominatim, urls } = setup(json(plaza));
    expect(await nominatim.reverse({ lat: -34.6083, lon: -58.3712 })).toMatchObject({
      name: 'Plaza de Mayo',
    });
    const url = new URL(urls[0]!);
    expect(url.pathname).toBe('/reverse');
    expect(url.searchParams.get('lat')).toBe('-34.6083');
  });

  it('returns null where there is nothing to name', async () => {
    const { nominatim } = setup(json({ error: 'Unable to geocode' }));
    expect(await nominatim.reverse({ lat: 0, lon: 0 })).toBeNull();
  });
});

describe('rate limit', () => {
  it('waits so requests are at least one second apart, as the usage policy requires', async () => {
    const { nominatim, waits, advance } = setup(json([]), json([]), json([]));
    await nominatim.search('a');
    advance(300);
    await nominatim.search('b');
    advance(1_500);
    await nominatim.search('c');
    expect(waits).toEqual([700]);
  });
});
