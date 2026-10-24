// Renders the app icons in public/icons from their SVG sources, with Playwright's Chromium:
//   node scripts/make-icons.ts
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const ICONS = [
  { source: 'icon.svg', out: 'icon-192.png', size: 192 },
  { source: 'icon.svg', out: 'icon-512.png', size: 512 },
  { source: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512 },
  // iOS rounds the corners itself, so its icon is the full-bleed one.
  { source: 'icon-maskable.svg', out: 'apple-touch-icon.png', size: 180 },
];

const dir = new URL('../public/icons/', import.meta.url);
const browser = await chromium.launch();
const page = await browser.newPage();
for (const { source, out, size } of ICONS) {
  const svg = readFileSync(new URL(source, dir), 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`,
  );
  await page.screenshot({ path: new URL(out, dir).pathname, omitBackground: true });
  console.log(`${out} (${size} px)`);
}
await browser.close();
