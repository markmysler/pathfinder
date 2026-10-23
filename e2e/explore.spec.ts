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

test('runs A* between two searched places and plays it to the end', async ({ page, context }) => {
  const { overpassRequests } = await fakeTheInternet(context);
  await page.goto('/');
  await choosePlaces(page);
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
  await page.getByRole('button', { name: 'Run A* search' }).click();
  await expect(page.getByRole('status')).toContainText('Downloading streets from OpenStreetMap');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Run A* search' })).toBeEnabled();
});

test('steps through the search one expansion at a time', async ({ page, context }) => {
  await fakeTheInternet(context);
  await page.goto('/');
  await choosePlaces(page);
  await page.getByRole('radio', { name: 'Breadth-first search' }).check();
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
  await page.getByRole('button', { name: 'Run A* search' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit setup' }).filter({ visible: true }).click();
  await page.getByRole('radio', { name: 'Dijkstra' }).check();
  await page.getByRole('button', { name: 'Run Dijkstra' }).click();
  await expect(page.getByRole('heading', { name: 'Dijkstra', exact: true })).toBeVisible();
  expect(overpassRequests).toHaveLength(1);
});
