/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const DARK = '#0e1116';
const DAY = 24 * 60 * 60;

// GitHub Pages serves the site from /<repo>/; the deploy workflow sets BASE_PATH.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
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
        // The whole app, the map's code and MapLibre's worker included, so Explore works offline.
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
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // The first test of a page compiles its whole module graph, slower with the suite in parallel.
    testTimeout: 15_000,
  },
});
