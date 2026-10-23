import { readFileSync } from 'node:fs';
import type { BrowserContext } from '@playwright/test';

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

/** Serves the outside world (map style, address search, Overpass) from fixtures. */
export async function fakeTheInternet(context: BrowserContext, { overpassDelayMs = 0 } = {}) {
  const overpassRequests: string[] = [];
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
  return { overpassRequests };
}
