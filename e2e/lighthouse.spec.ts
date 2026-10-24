import { chromium, expect, test } from '@playwright/test';
import lighthouse from 'lighthouse';

/**
 * Lighthouse's phone profile on the built site, against the budgets in docs/PLAN.md. It runs in a
 * Chromium of its own, started here with a debugging port: Lighthouse's own launcher misplaces
 * its profile folder on WSL.
 */
const PAGES = [
  { name: 'Explore', path: '/', performance: 70 },
  { name: 'Learn', path: '/#/learn', performance: 90 },
  { name: 'an article', path: '/#/learn/astar', performance: 90 },
];

const PORT = 9333;

for (const { name, path, performance } of PAGES) {
  test(`${name} meets its Lighthouse budget on a phone`, async ({ baseURL }) => {
    test.setTimeout(120_000);
    const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] });
    try {
      const result = await lighthouse(`${baseURL}${path}`, {
        port: PORT,
        output: 'json',
        logLevel: 'error',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      });
      const { categories, audits } = result!.lhr;
      const score = (id: string) => Math.round((categories[id]?.score ?? 0) * 100);
      const failing = (id: string) =>
        categories[id]!.auditRefs.filter(
          (ref) => (audits[ref.id]?.score ?? 1) < 1 && ref.weight > 0,
        ).map((ref) => ref.id);
      console.log(
        `${name}: ` +
          ['performance', 'accessibility', 'best-practices', 'seo']
            .map((id) => `${id} ${score(id)}`)
            .join(', '),
      );
      expect
        .soft(
          score('performance'),
          'performance: ' +
            [
              'first-contentful-paint',
              'largest-contentful-paint',
              'total-blocking-time',
              'speed-index',
            ]
              .map((id) => `${id} ${audits[id]?.displayValue}`)
              .join(', '),
        )
        .toBeGreaterThanOrEqual(performance);
      for (const category of ['accessibility', 'best-practices', 'seo']) {
        expect.soft(failing(category), category).toEqual([]);
      }
      expect.soft(audits['cumulative-layout-shift']?.numericValue ?? 1).toBeLessThanOrEqual(0.1);
    } finally {
      await browser.close();
    }
  });
}
