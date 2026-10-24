import { expect, test } from '@playwright/test';
import { chooseOnly, choosePlaces } from './explore';
import { fakeTheInternet } from './network';

test.beforeEach(async ({ context }) => {
  await fakeTheInternet(context);
});

test('Learn downloads well under a megabyte of script, leaving the map to Explore', async ({
  page,
}) => {
  let bytes = 0;
  page.on('response', async (response) => {
    if (response.request().resourceType() === 'script') bytes += (await response.body()).length;
  });
  await page.goto('/#/learn/astar');
  await expect(page.getByRole('heading', { level: 1, name: 'A* search' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(bytes).toBeLessThan(1_000_000);
});

test('Explore works before the map arrives, which shows it is loading meanwhile', async ({
  page,
}) => {
  // Hold back the map's own script.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let holding = 0;
  await page.route(/\/assets\/MapCanvas-[^/]+\.js$/, async (route) => {
    holding++;
    await held;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('status').filter({ hasText: 'Loading the map…' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Start' }).fill('casa');
  await page.getByRole('textbox', { name: 'Start' }).press('Enter');
  await expect(page.getByRole('button', { name: /Casa Rosada/ })).toBeVisible();

  expect(holding).toBeGreaterThan(0);
  release();
  await expect(page.getByTestId('map')).toBeVisible();
  await expect(page.getByText('Loading the map…')).toBeHidden();
});

test('Explore loads deck.gl only when there is a search to draw', async ({ page }) => {
  const overlays: string[] = [];
  page.on('request', (request) => {
    if (/\/assets\/overlay-[^/]+\.js$/.test(request.url())) overlays.push(request.url());
  });
  await page.goto('/');
  await choosePlaces(page);
  await expect(page.getByTestId('map')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(overlays).toEqual([]);

  await chooseOnly(page, 'astar');
  await page.getByRole('button', { name: 'Run A* search' }).click();
  await expect.poll(() => overlays.length).toBe(1);
});
