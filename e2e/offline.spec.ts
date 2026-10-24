import { expect, test } from '@playwright/test';
import { fakeTheInternet } from './network';
import { chooseOnly, choosePlaces } from './explore';

test('can be installed: a manifest with its name, its own window and its icons', async ({
  page,
  context,
}) => {
  await fakeTheInternet(context);
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifestUrl = new URL(href!, page.url());
  const manifest = await (await page.request.get(manifestUrl.toString())).json();
  expect(manifest).toMatchObject({
    name: 'Pathfinder',
    display: 'standalone',
    theme_color: '#0e1116',
    background_color: '#0e1116',
  });
  const icons = manifest.icons as { src: string; sizes: string; purpose?: string }[];
  expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  for (const icon of icons) {
    const response = await page.request.get(new URL(icon.src, manifestUrl).toString());
    expect(response.headers()['content-type']).toBe('image/png');
  }
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /favicon\.svg$/);
});

test('keeps Explore and Learn working offline, after one visit', async ({ page, context }) => {
  await fakeTheInternet(context);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Start' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Start' })).toBeVisible();
  await page.goto('/#/learn/astar');
  await expect(page.getByRole('heading', { level: 1, name: 'A* search' })).toBeVisible();
});

test('runs a route again offline, on the streets saved when it first ran', async ({
  page,
  context,
}) => {
  const { overpassRequests } = await fakeTheInternet(context);
  await page.goto('/');
  await choosePlaces(page);
  await chooseOnly(page, 'astar');
  await page.getByRole('button', { name: 'Run A* search' }).click();
  await expect(page.getByRole('heading', { name: 'A* search', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit setup' }).first().click();

  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();
  const saved = page.getByRole('region', { name: /Saved on this/ });
  await expect(saved.getByRole('button', { pressed: true })).toContainText(
    'Casa Rosada → Cabildo de Buenos Aires',
  );
  await expect(page.getByText('Streets for this route are on this device.')).toBeAttached();

  await page.getByRole('button', { name: 'Run A* search' }).click();
  await expect(page.getByRole('heading', { name: 'A* search', exact: true })).toBeVisible();
  expect(overpassRequests).toHaveLength(1);

  await context.setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: 'Back online' })).toBeVisible();
});
