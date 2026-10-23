import { expect, test } from '@playwright/test';
import { fakeTheInternet } from './network';

test.beforeEach(async ({ context }) => {
  await fakeTheInternet(context);
});

test('reads an article and steps through its diagram', async ({ page, isMobile }) => {
  await page.goto('/#/learn');
  await page
    .getByRole('link', { name: /A\* search/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'A* search' })).toBeVisible();

  const figure = page
    .getByRole('figure')
    .filter({ has: page.getByRole('button', { name: 'Next step' }) });
  await figure.getByRole('button', { name: 'Next step' }).click();
  await figure.getByRole('button', { name: 'Next step' }).click();
  await expect(figure.locator('figcaption')).toContainText('A* takes B next');
  if (isMobile) await figure.getByRole('button', { name: 'As Dijkstra' }).click();
  else await figure.getByRole('button', { name: 'Show as Dijkstra' }).click();
  await expect(figure.locator('figcaption')).toContainText('Dijkstra takes');

  // The real-streets comparison renders both maps.
  await expect(page.getByRole('img', { name: /explored \d+ roads/ })).toHaveCount(2);
});

test('steps through a search from both ends, and replays it one way', async ({
  page,
  isMobile,
}) => {
  await page.goto('/#/learn/bidirectional');
  await expect(page.getByRole('heading', { level: 1, name: 'Bidirectional search' })).toBeVisible();
  const figure = page
    .getByRole('figure')
    .filter({ has: page.getByRole('button', { name: 'Next step' }) });
  await figure.getByRole('button', { name: 'Next step' }).click();
  await expect(figure).toContainText('Step 2 of 4 · from B');
  await expect(figure.locator('figcaption')).toContainText('the sides meet there');
  if (isMobile) await figure.getByRole('button', { name: 'As Dijkstra' }).click();
  else await figure.getByRole('button', { name: 'Show as Dijkstra' }).click();
  await expect(figure.locator('figcaption')).toContainText('Dijkstra takes');
  await expect(page.getByRole('table', { name: 'On the same streets' })).toContainText(
    'Bidirectional A*',
  );
});

test('goes from an article to the map with its algorithms ticked', async ({ page }) => {
  await page.goto('/#/learn/greedy');
  await page.getByRole('link', { name: 'Race it against A*' }).click();
  await expect(page.getByRole('textbox', { name: 'Start' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run 2 algorithms' })).toBeVisible();
});

test('does not scroll sideways on any article', async ({ page }) => {
  for (const slug of ['', '/graphs', '/roads', '/astar', '/bidirectional', '/which', '/glossary']) {
    await page.goto(`/#/learn${slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, slug).toBe(0);
  }
});

test('switches on rush hour and watches Dijkstra take the other way', async ({ page }) => {
  await page.goto('/#/learn/roads');
  await page.getByRole('heading', { name: 'Live traffic', level: 2 }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Rush hour' }).click();
  await expect(page.getByText(/At rush hour A–B moves at a quarter of its speed/)).toBeVisible();
  await expect(page.getByText('Its route on clear roads · 6')).toBeVisible();
});
