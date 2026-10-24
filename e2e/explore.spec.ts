import { expect, test, type Page } from '@playwright/test';
import { chooseOnly, choosePlaces } from './explore';
import { fakeTheInternet } from './network';

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

/** How many pixels of the visible map show A*'s lavender (#B197FC), over the dark basemap. */
async function lavenderPixels(page: Page) {
  const png = (await page.getByTestId('map').filter({ visible: true }).screenshot()).toString(
    'base64',
  );
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b] = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
      if (b - r > 30 && b - g > 40 && r > g) count++;
    }
    return count;
  }, png);
}

/** Loses, or gives back, every WebGL context on the page, as a GPU reset would. */
async function graphicsContexts(page: Page, action: 'lose' | 'restore') {
  await page.evaluate((action) => {
    const holder = window as unknown as { lostContexts?: WEBGL_lose_context[] };
    if (action === 'lose') {
      holder.lostContexts = [...document.querySelectorAll('canvas')].flatMap((canvas) => {
        const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
        extension?.loseContext();
        return extension ? [extension] : [];
      });
    } else {
      holder.lostContexts!.forEach((extension) => extension.restoreContext());
    }
  }, action);
}

test('survives losing the graphics context, and draws the search again once it is back', async ({
  page,
  context,
}) => {
  await fakeTheInternet(context);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('/');
  await choosePlaces(page);
  await chooseOnly(page, 'astar');
  await page.getByRole('button', { name: 'Run A* search' }).click();
  await page.getByRole('button', { name: 'Jump to end' }).click();
  await expect(page.getByText('Found route')).toBeVisible();
  await page.waitForTimeout(500);
  const before = await lavenderPixels(page);
  expect(before).toBeGreaterThan(500);

  // A GPU reset, or a phone reclaiming memory, takes the contexts away mid-session.
  await graphicsContexts(page, 'lose');
  await page.getByRole('button', { name: 'Step back' }).click();
  await page.getByRole('button', { name: 'Jump to end' }).click();
  await expect(page.getByRole('heading', { name: 'A* search', exact: true })).toBeVisible();

  await graphicsContexts(page, 'restore');
  await expect.poll(() => lavenderPixels(page)).toBeGreaterThan(before * 0.8);
  expect(errors).toEqual([]);
});

/** Keeps track of every WebGL context the page creates, without keeping any alive. */
async function trackGraphicsContexts(page: Page) {
  await page.addInitScript(() => {
    const created: WeakRef<WebGL2RenderingContext>[] = [];
    (window as unknown as { graphicsContexts: typeof created }).graphicsContexts = created;
    const getContext = HTMLCanvasElement.prototype.getContext as (
      this: HTMLCanvasElement,
      ...args: unknown[]
    ) => RenderingContext | null;
    const seen = new WeakSet<HTMLCanvasElement>();
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: unknown[]
    ) {
      const context = getContext.apply(this, args);
      if (String(args[0]).startsWith('webgl') && context && !seen.has(this)) {
        seen.add(this);
        created.push(new WeakRef(context as WebGL2RenderingContext));
      }
      return context;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
}

/** WebGL contexts whose canvas has left the page; `holding` keeps only those not yet lost. */
const leftBehind = (page: Page, holding: boolean) =>
  page.evaluate(
    (holding) =>
      (
        window as unknown as { graphicsContexts: WeakRef<WebGL2RenderingContext>[] }
      ).graphicsContexts
        .map((ref) => ref.deref())
        .filter(
          (context) =>
            context &&
            !(holding && context.isContextLost()) &&
            !(context.canvas instanceof HTMLCanvasElement && context.canvas.isConnected),
        ).length,
    holding,
  );

test('lets go of the maps it no longer shows', async ({ page, context }) => {
  await fakeTheInternet(context);
  await trackGraphicsContexts(page);
  await page.goto('/');
  await choosePlaces(page);
  // Browsers allow about 16 contexts, and each map takes two: going back and forth must not pile up.
  for (let round = 0; round < 2; round++) {
    await page.getByRole('button', { name: 'Run 3 algorithms' }).click();
    await expect(page.getByRole('article', { name: 'Dijkstra' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit setup' }).filter({ visible: true }).click();
    await expect(page.getByRole('button', { name: 'Run 3 algorithms' })).toBeVisible();
  }
  expect(await leftBehind(page, true)).toBe(0);
  // Nor may anything keep a gone map reachable, with the search data its layers were drawing.
  await (await context.newCDPSession(page)).send('HeapProfiler.collectGarbage');
  expect(await leftBehind(page, false)).toBe(0);
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

test('shows the frontier and the pseudocode line by line', async ({ page, context, isMobile }) => {
  await fakeTheInternet(context);
  await page.goto('/');
  await choosePlaces(page);
  await chooseOnly(page, 'astar');
  await page.getByRole('slider', { name: 'Estimate weight' }).fill('1.5');
  await page.getByRole('button', { name: 'Run A* search' }).click();
  await expect(page.getByRole('heading', { name: 'A* search · 1.5×' })).toBeVisible();
  await page.getByRole('button', { name: 'Step back' }).click(); // pauses
  await page.getByRole('slider', { name: 'Step' }).fill('5');
  if (isMobile) await page.getByRole('button', { name: /Details/ }).click();

  await page.getByRole('tab', { name: 'Frontier' }).click();
  const frontier = page.getByRole('tabpanel', { name: 'Frontier' });
  await expect(frontier).toContainText('A* takes the lowest f first');
  await expect(frontier.getByText('next')).toBeVisible();

  await page.getByRole('tab', { name: isMobile ? 'Code' : 'Pseudocode' }).click();
  const code = page.getByRole('tabpanel', { name: isMobile ? 'Code' : 'Pseudocode' });
  await expect(code.locator('[aria-current="step"]')).toContainText('popLowest');
  await code.getByRole('button', { name: 'Next line' }).click();
  await expect(code).toContainText('2 of');
});

test('runs a search from both ends, marking where the sides met', async ({
  page,
  context,
  isMobile,
}) => {
  await fakeTheInternet(context);
  await page.goto('/');
  await choosePlaces(page);
  await chooseOnly(page, 'bidijkstra');
  await page.getByRole('button', { name: 'Run Bidirectional Dijkstra' }).click();
  await expect(
    page.getByRole('heading', {
      name: isMobile ? 'Bi-Dijkstra' : 'Bidirectional Dijkstra',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Jump to end' }).click();
  await expect(page.getByText('Found route')).toBeVisible();
  await expect(page.getByText(/[Mm]et at/)).toBeVisible();
  if (isMobile) await page.getByRole('button', { name: /Details/ }).click();
  await expect(page.getByRole('region', { name: 'Can it stop yet?' })).toContainText(
    'Yes. Nothing left can beat',
  );
  await expect(page.getByRole('region', { name: 'Best meeting so far' })).toBeVisible();

  await page.getByRole('tab', { name: 'Frontier' }).click();
  if (isMobile) {
    await page.getByRole('radio', { name: /From B/ }).click();
    await expect(page.getByRole('tabpanel')).toContainText('Cost to B, lowest first');
  } else {
    await expect(page.getByRole('region', { name: /^From A/ })).toBeVisible();
    await expect(page.getByRole('region', { name: /^From B/ })).toBeVisible();
  }
});

test('watches contraction hierarchies prepare the map, then climb from both ends', async ({
  page,
  context,
  isMobile,
}) => {
  await fakeTheInternet(context);
  await page.goto('/');
  await choosePlaces(page);
  await chooseOnly(page, 'ch');
  await page.getByRole('button', { name: 'Run Contraction hierarchies' }).click();
  await expect(page.getByRole('tab', { name: /Prepare/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/^Contracted [\d,]+ of [\d,]+ nodes/)).toBeVisible();
  await page.getByRole('button', { name: 'Skip to the search' }).click();
  await expect(page.getByRole('tab', { name: /Search/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Jump to end' }).click();
  await expect(page.getByText('Found route')).toBeVisible();
  if (isMobile) await page.getByRole('button', { name: /Details/ }).click();
  await expect(page.getByRole('heading', { name: /^They met at / })).toBeVisible();
});

test('steps Bellman-Ford a round at a time', async ({ page, context }) => {
  await fakeTheInternet(context);
  await page.goto('/');
  await choosePlaces(page);
  await chooseOnly(page, 'bellmanford');
  await page.getByRole('button', { name: 'Run Bellman-Ford' }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('slider', { name: 'Step' }).fill('0');
  await page.getByRole('button', { name: 'Forward one round' }).click();
  await page.getByRole('button', { name: 'Forward one round' }).click();
  await expect(page.getByText('Round 1', { exact: true })).toBeVisible();
});

test('compares ALT and contraction hierarchies with what preparing cost', async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(isMobile, 'The phone results table keeps three columns.');
  await fakeTheInternet(context);
  await page.goto('/');
  await choosePlaces(page);
  for (const id of ['astar', 'alt', 'ch']) {
    const box = page.locator(`input[aria-labelledby="algorithm-${id}"]`);
    if (!(await box.isChecked())) await box.click();
  }
  await page.getByRole('button', { name: /^Run \d algorithms/ }).click();
  await page.getByRole('button', { name: 'Jump to end' }).click();
  await expect(page.getByRole('columnheader', { name: 'Preparing, once' })).toBeVisible();
  await expect(page.getByRole('row', { name: /ALT/ })).toContainText('8 landmarks');
  await expect(page.getByRole('row', { name: /Contraction hierarchies/ })).toContainText(
    'shortcuts',
  );
});

async function addTomTomKey(page: Page) {
  await page.getByRole('button', { name: 'Add key' }).click();
  const dialog = page.getByRole('dialog', { name: 'Live traffic' });
  await dialog.getByLabel('Your TomTom API key').fill('my-own-key');
  await dialog.getByRole('button', { name: 'Test key' }).click();
  await expect(dialog.getByText('Works: TomTom sent traffic for a test area.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save and turn on' }).click();
  await expect(dialog).toBeHidden();
}

test('routes a car with live traffic from the user’s own key, asked from the browser', async ({
  page,
  context,
  isMobile,
}) => {
  const { trafficRequests } = await fakeTheInternet(context);
  await page.goto('/');
  await addTomTomKey(page);
  await expect(page.getByRole('switch', { name: 'Live traffic' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await choosePlaces(page);
  await chooseOnly(page, 'astar');
  await page.getByRole('button', { name: 'Run A* search' }).click();
  await expect(page.getByRole('button', { name: 'Traffic' })).toBeVisible();
  // The browser asks TomTom itself, with the user's key.
  expect(trafficRequests.length).toBeGreaterThan(0);
  expect(
    trafficRequests.every((url) => new URL(url).searchParams.get('key') === 'my-own-key'),
  ).toBe(true);
  if (!isMobile) await expect(page.getByRole('banner')).toContainText('Live traffic, TomTom');
  await page.getByRole('button', { name: 'Jump to end' }).click();
  if (isMobile) await page.getByRole('button', { name: /Details/ }).click();
  await expect(page.getByText(/Live speeds on [\d,]+ of [\d,]+ car roads/)).toBeVisible();

  // The key stays in this browser for next time.
  await page.reload();
  await expect(page.getByText('TomTom · your key')).toBeVisible();
});

test('falls back to speed limits when TomTom refuses the key, and says so', async ({
  page,
  context,
}) => {
  await fakeTheInternet(context, { traffic: 'refused' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add key' }).click();
  const dialog = page.getByRole('dialog', { name: 'Live traffic' });
  await dialog.getByLabel('Your TomTom API key').fill('wrong-key');
  await dialog.getByRole('button', { name: 'Test key' }).click();
  await expect(dialog.getByText(/TomTom refused this key/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Save and turn on' }).click();
  await choosePlaces(page);
  await chooseOnly(page, 'astar');
  await page.getByRole('button', { name: 'Run A* search' }).click();
  await expect(page.getByText('No live traffic: TomTom refused your key.')).toBeVisible();
  await page.getByRole('button', { name: 'Jump to end' }).click();
  await expect(page.getByText('Found route')).toBeVisible();
});
