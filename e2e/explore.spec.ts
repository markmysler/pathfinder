import { expect, test, type Page } from '@playwright/test';
import { fakeTheInternet } from './network';

async function choosePlaces(page: Page) {
  await page.getByRole('textbox', { name: 'Start' }).fill('casa');
  await page.getByRole('textbox', { name: 'Start' }).press('Enter');
  await page.getByRole('button', { name: /Casa Rosada/ }).click();
  await page.getByRole('textbox', { name: 'Destination' }).fill('cabildo');
  await page.getByRole('textbox', { name: 'Destination' }).press('Enter');
  await page.getByRole('button', { name: /Cabildo de Buenos Aires/ }).click();
}

/** Leaves only the named algorithm ticked. */
async function chooseOnly(page: Page, name: string) {
  for (const box of await page.getByRole('checkbox').all()) {
    const wanted = (await box.getAttribute('aria-labelledby')) === `algorithm-${name}`;
    if ((await box.isChecked()) !== wanted) await box.click();
  }
}

test('runs A* between two searched places and plays it to the end', async ({ page, context }) => {
  const { overpassRequests } = await fakeTheInternet(context);
  await page.goto('/');
  await choosePlaces(page);
  await chooseOnly(page, 'astar');
  await page.getByRole('button', { name: 'Run A* search' }).click();

  await expect(page.getByRole('heading', { name: 'A* search', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  expect(overpassRequests).toHaveLength(1);

  await page.getByRole('button', { name: 'Jump to end' }).click();
  await expect(page.getByText('Found route')).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Step' })).toHaveAttribute(
    'max',
    await page.getByRole('slider', { name: 'Step' }).inputValue(),
  );
});

test('shows progress while downloading and can cancel', async ({ page, context }) => {
  await fakeTheInternet(context, { overpassDelayMs: 3_000 });
  await page.goto('/');
  await choosePlaces(page);
  await chooseOnly(page, 'astar');
  await page.getByRole('button', { name: 'Run A* search' }).click();
  await expect(page.getByRole('status')).toContainText('Downloading streets from OpenStreetMap');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Run A* search' })).toBeEnabled();
});

test('steps through the search one expansion at a time', async ({ page, context }) => {
  await fakeTheInternet(context);
  await page.goto('/');
  await choosePlaces(page);
  await chooseOnly(page, 'bfs');
  await page.getByRole('button', { name: 'Run Breadth-first search' }).click();
  await page.getByRole('button', { name: 'Step back' }).click(); // pauses
  await page.getByRole('slider', { name: 'Step' }).fill('10');
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(page.getByRole('slider', { name: 'Step' })).toHaveValue('11');
  await expect(page.getByText(/Took the oldest node in the queue/).first()).toBeVisible();
});

test('keeps the downloaded streets for the next run', async ({ page, context }) => {
  const { overpassRequests } = await fakeTheInternet(context);
  await page.goto('/');
  await choosePlaces(page);
  await chooseOnly(page, 'astar');
  await page.getByRole('button', { name: 'Run A* search' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit setup' }).filter({ visible: true }).click();
  await chooseOnly(page, 'dijkstra');
  await page.getByRole('button', { name: 'Run Dijkstra' }).click();
  await expect(page.getByRole('heading', { name: 'Dijkstra', exact: true })).toBeVisible();
  expect(overpassRequests).toHaveLength(1);
});

test('compares three algorithms on one clock and fills in their results', async ({
  page,
  context,
  isMobile,
}) => {
  const { overpassRequests } = await fakeTheInternet(context);
  await page.goto('/');
  await choosePlaces(page);
  await page.getByRole('button', { name: 'Run 3 algorithms' }).click();

  for (const name of ['Greedy best-first', 'Dijkstra', 'A* search']) {
    await expect(page.getByRole('article', { name })).toBeVisible();
  }
  expect(overpassRequests).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Maps move together' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: 'Jump to end' }).click();
  const rows = page.getByRole('table').getByRole('row');
  await expect(rows).toHaveCount(4);
  if (!isMobile) {
    for (const row of await rows.all().then((all) => all.slice(1))) {
      await expect(row).toContainText('Done · step');
    }
  }
  await expect(page.getByRole('table').getByText('best').first()).toBeVisible();
});

test('on a phone, shows up to three maps and swaps in the one picked', async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(!isMobile, 'Phone layout');
  await fakeTheInternet(context);
  await page.goto('/');
  await choosePlaces(page);
  for (const name of ['bfs', 'dfs']) {
    await page.locator(`input[value="${name}"]`).check();
  }
  await page.getByRole('button', { name: 'Run 5 algorithms' }).click();
  await expect(page.getByRole('heading', { name: 'Comparing 5' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(3);

  const chips = page.getByRole('group', { name: 'Maps to show, up to 3' });
  await chips.getByRole('button', { name: 'BFS' }).click();
  await expect(page.getByRole('article', { name: 'Breadth-first search' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Greedy best-first' })).toHaveCount(0);
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(6);
});
