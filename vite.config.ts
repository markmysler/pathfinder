/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const DARK = '#0e1116';

/**
 * The only places the built site may talk to. Pathfinder has no server of its own; the browser
 * goes straight to these (see the README's "Privacy and keys"). Traffic keys live in local storage,
 * so this also limits where a script injected into the page could send them.
 */
const CONNECT = [
  'https://tiles.openfreemap.org', // map style, fonts, sprites and tiles
  'https://overpass-api.de', // streets, three Overpass servers tried in turn
  'https://overpass.private.coffee',
  'https://maps.mail.ru',
  'https://nominatim.openstreetmap.org', // address search
  'https://api.tomtom.com', // live traffic, only with the user's own key
  'https://data.traffic.hereapi.com',
];

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // MapLibre and deck.gl start workers from blob: URLs as well as from files.
  "worker-src 'self' blob:",
  // React and MapLibre set inline style attributes.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tiles.openfreemap.org",
  "font-src 'self' data:",
  `connect-src 'self' data: blob: ${CONNECT.join(' ')}`,
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** Adds the policy to the built page only: Vite's dev server needs inline scripts and a socket. */
const contentSecurityPolicy = (): Plugin => ({
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
      injectTo: 'head-prepend',
    },
  ],
});
const DAY = 24 * 60 * 60;

// GitHub Pages serves the site from /<repo>/; the deploy workflow sets BASE_PATH.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    contentSecurityPolicy(),
    // Installable, and usable offline once visited. A new version waits for the user to reload.
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'robots.txt'],
      manifest: {
        name: 'Pathfinder',
        short_name: 'Pathfinder',
        description: 'Learn graph search by watching algorithms route across real streets.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        theme_color: DARK,
        background_color: DARK,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The whole app, the map's code and MapLibre's worker included, so Explore works offline:
        // about 1.1 MB over the network, most of which Explore loads anyway. Caching the map code
        // only at runtime was weighed and rejected; see "Offline and updates" in ARCHITECTURE.md.
        globPatterns: ['**/*.{js,mjs,css,html,woff2,svg,png}'],
        // The interface is in English: other alphabets' font files load only if a page needs them.
        globIgnores: ['**/*-{cyrillic,cyrillic-ext,greek,vietnamese,latin-ext}-*.woff2'],
        maximumFileSizeToCacheInBytes: 3_000_000,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // The map's style, fonts and icons: small, and needed for any map at all.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/(styles|fonts|sprites)\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'map-style',
              expiration: { maxEntries: 400, maxAgeSeconds: 30 * DAY },
            },
          },
          {
            // Tiles of places already seen, so saved routes have a map offline; capped.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 3000, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    // vite-plugin-pwa's virtual module only exists in a real build; tests get a stand-in.
    alias: {
      'virtual:pwa-register/react': fileURLToPath(
        new URL('./src/test/pwaRegister.ts', import.meta.url),
      ),
    },
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // The first test of a page compiles its whole module graph, slower with the suite in parallel.
    testTimeout: 15_000,
  },
});
