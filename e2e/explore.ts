import type { Page } from '@playwright/test';

/** Picks Casa Rosada as A and the Cabildo as B, through the (faked) address search. */
export async function choosePlaces(page: Page) {
  await page.getByRole('textbox', { name: 'Start' }).fill('casa');
  await page.getByRole('textbox', { name: 'Start' }).press('Enter');
  await page.getByRole('button', { name: /Casa Rosada/ }).click();
  await page.getByRole('textbox', { name: 'Destination' }).fill('cabildo');
  await page.getByRole('textbox', { name: 'Destination' }).press('Enter');
  await page.getByRole('button', { name: /Cabildo de Buenos Aires/ }).click();
}

/** Leaves only the named algorithm ticked. */
export async function chooseOnly(page: Page, name: string) {
  const bothEnds = page.getByRole('button', { name: /From both ends/ });
  if (name.startsWith('bi') && (await bothEnds.getAttribute('aria-expanded')) === 'false') {
    await bothEnds.click();
  }
  for (const box of await page.getByRole('checkbox').all()) {
    const wanted = (await box.getAttribute('aria-labelledby')) === `algorithm-${name}`;
    if ((await box.isChecked()) !== wanted) await box.click();
  }
}
