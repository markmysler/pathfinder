import { defineConfig, devices } from '@playwright/test';

// Mobile and desktop are both first-class targets, so every e2e test runs on both.
export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'on-first-retry' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /lighthouse/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: /lighthouse/ },
    // Lighthouse emulates a phone itself, and times the page: it runs alone, after the rest.
    { name: 'lighthouse', testMatch: /lighthouse/, dependencies: ['desktop', 'mobile'] },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
