import { expect, test } from '@playwright/test';

test('loads the app shell', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Pathfinder');
  await expect(page.getByRole('heading', { name: 'Pathfinder' })).toBeVisible();
});

test('does not scroll horizontally', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
