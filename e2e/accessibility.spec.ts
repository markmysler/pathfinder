import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { TOPICS } from '../src/learn/topics';
import { chooseOnly, choosePlaces } from './explore';
import { fakeTheInternet } from './network';

/** Runs axe over the page as it stands, listing what it finds in a form that reads as a diff. */
async function expectNothingToFault(page: Page, state: string) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const found = violations.map(
    (v) => `${state}: ${v.id} (${v.nodes.map((node) => node.target.join(' ')).join(', ')})`,
  );
  expect(found).toEqual([]);
}

test.beforeEach(async ({ context }) => {
  await fakeTheInternet(context);
});

test('Explore has nothing axe can fault, from planning to comparing', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Start' })).toBeVisible();
  await expectNothingToFault(page, 'planning');

  await page.getByRole('textbox', { name: 'Start' }).fill('casa');
  await page.getByRole('textbox', { name: 'Start' }).press('Enter');
  await expect(page.getByRole('button', { name: /Casa Rosada/ })).toBeVisible();
  await expectNothingToFault(page, 'search results');
  await page.getByRole('textbox', { name: 'Start' }).fill('');

  await choosePlaces(page);
  await page.getByRole('button', { name: 'Add key' }).click();
  await expect(page.getByRole('dialog', { name: 'Live traffic' })).toBeVisible();
  await expectNothingToFault(page, 'traffic dialog');
  await page.keyboard.press('Escape');

  await chooseOnly(page, 'astar');
  await page.getByRole('button', { name: 'Run A* search' }).click();
  await page.getByRole('button', { name: 'Step back' }).click(); // pauses
  await expectNothingToFault(page, 'running');
  if (isMobile) await page.getByRole('button', { name: /Details/ }).click();
  await page.getByRole('tab', { name: 'Frontier' }).click();
  await expectNothingToFault(page, 'frontier');
  await page.getByRole('tab', { name: isMobile ? 'Code' : 'Pseudocode' }).click();
  await expectNothingToFault(page, 'pseudocode');
  if (isMobile) await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Edit setup' }).filter({ visible: true }).click();
  for (const name of ['greedy', 'dijkstra', 'astar']) {
    await page.locator(`input[value="${name}"]`).check();
  }
  await page.getByRole('button', { name: 'Run 3 algorithms' }).click();
  await page.getByRole('button', { name: 'Jump to end' }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expectNothingToFault(page, 'comparing');
});

test('Learn has nothing axe can fault, on its home and in every article', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/#/learn');
  await expect(page.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible();
  await expectNothingToFault(page, 'learn');
  for (const { slug, title } of TOPICS) {
    await page.goto(`/#/learn/${slug}`);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expectNothingToFault(page, slug);
  }
});
