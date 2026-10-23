import { readFileSync } from 'node:fs';
import type { BrowserContext } from '@playwright/test';
import { encodeTile, type TileLine } from '../src/test/vectorTile';

const overpassFixture = readFileSync(
  new URL('../src/osm/fixtures/plaza-de-mayo.overpass.json', import.meta.url),
  'utf8',
);

const places = [
  {
    name: 'Casa Rosada',
    display_name: 'Casa Rosada, Balcarce 50, Buenos Aires',
    lat: '-34.608',
    lon: '-58.3703',
  },
  {
    name: 'Cabildo de Buenos Aires',
    display_name: 'Cabildo de Buenos Aires, Bolívar 65, Buenos Aires',
    lat: '-34.6087',
    lon: '-58.3738',
  },
];

// An empty dark style: the basemap is not what these tests are about, and real tiles are slow.
const blankStyle = {
  version: 8,
  sources: {},
  layers: [{ id: 'land', type: 'background', paint: { 'background-color': '#12161c' } }],
};

type Element =
  | { type: 'node'; id: number; lat: number; lon: number }
  | { type: 'way'; id: number; nodes: number[]; tags?: Record<string, string> };

/** Avenida de Mayo and Rivadavia jammed both ways, as TomTom's flow tiles would carry them. */
function jammedAvenues(): TileLine[] {
  const elements = (JSON.parse(overpassFixture) as { elements: Element[] }).elements;
  const at = new Map<number, [number, number]>();
  for (const e of elements) if (e.type === 'node') at.set(e.id, [e.lon, e.lat]);
  const lines: TileLine[] = [];
  for (const e of elements) {
    if (e.type !== 'way' || !['Avenida de Mayo', 'Rivadavia'].includes(e.tags?.name ?? ''))
      continue;
    const line = e.nodes.map((id) => at.get(id)).filter((p) => p !== undefined);
    if (line.length < 2) continue;
    const tags = { road_category: 'primary', relative_speed: 0.15 };
    lines.push({ line, tags }, { line: [...line].reverse(), tags });
  }
  return lines;
}

export type FakeTraffic = 'jammed' | 'refused';

/** Serves the outside world (map style, address search, Overpass, traffic) from fixtures. */
export async function fakeTheInternet(
  context: BrowserContext,
  { overpassDelayMs = 0, traffic = 'jammed' as FakeTraffic } = {},
) {
  const overpassRequests: string[] = [];
  const trafficRequests: string[] = [];
  await context.route('https://api.tomtom.com/maps/orbis/traffic/flow/vector/tile/**', (route) => {
    const url = new URL(route.request().url());
    trafficRequests.push(url.toString());
    const headers = { 'Access-Control-Allow-Origin': '*' };
    if (traffic === 'refused') return route.fulfill({ status: 403, headers, json: {} });
    const [z, x, y] = url.pathname.split('/').slice(-3).map(Number) as [number, number, number];
    const body = Buffer.from(encodeTile('Traffic flow', { z, x, y }, jammedAvenues()));
    return route.fulfill({
      status: 200,
      headers,
      contentType: 'application/vnd.mapbox-vector-tile',
      body,
    });
  });
  await context.route('https://tiles.openfreemap.org/**', (route) =>
    route.request().url().endsWith('/styles/dark')
      ? route.fulfill({ json: blankStyle })
      : route.abort(),
  );
  await context.route('https://nominatim.openstreetmap.org/search?**', (route) => {
    const query = new URL(route.request().url()).searchParams.get('q')!.toLowerCase();
    return route.fulfill({ json: places.filter((p) => p.name.toLowerCase().includes(query)) });
  });
  await context.route('https://nominatim.openstreetmap.org/reverse?**', (route) =>
    route.fulfill({ json: { error: 'Unable to geocode' } }),
  );
  await context.route('**/api/interpreter', async (route) => {
    overpassRequests.push(route.request().url());
    if (overpassDelayMs) await new Promise((resolve) => setTimeout(resolve, overpassDelayMs));
    await route.fulfill({ body: overpassFixture, contentType: 'application/json' });
  });
  return { overpassRequests, trafficRequests };
}
