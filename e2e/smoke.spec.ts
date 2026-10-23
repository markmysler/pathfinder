import { expect, test } from '@playwright/test';
import { fakeTheInternet } from './network';

test.beforeEach(async ({ context }) => {
  await fakeTheInternet(context);
});

test('loads the app on Explore', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Pathfinder');
  await expect(page.getByRole('textbox', { name: 'Start' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Destination' })).toBeVisible();
});

test('does not scroll horizontally', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test('switches to Learn and back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Learn' }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Explore' }).filter({ visible: true }).first().click();
  await expect(page.getByRole('textbox', { name: 'Start' })).toBeVisible();
});
