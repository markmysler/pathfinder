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

test('goes from an article to the map with its algorithms ticked', async ({ page }) => {
  await page.goto('/#/learn/greedy');
  await page.getByRole('link', { name: 'Race it against A*' }).click();
  await expect(page.getByRole('textbox', { name: 'Start' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run 2 algorithms' })).toBeVisible();
});

test('does not scroll sideways on any article', async ({ page }) => {
  for (const slug of ['', '/graphs', '/astar', '/which', '/glossary']) {
    await page.goto(`/#/learn${slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, slug).toBe(0);
  }
});
