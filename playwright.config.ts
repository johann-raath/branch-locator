import { defineConfig } from '@playwright/test';

/**
 * Browser smoke tests against the *running production container* (not `ng serve`), because some
 * failures only exist in the optimised bundle. Start it first:
 *
 *   docker build -t branch-locator . && docker run --rm -p 8080:8080 branch-locator
 *   npm run e2e
 *
 * Uses the Chrome/Edge already installed, so no browser download. Set E2E_CHANNEL=msedge on a machine
 * with Edge but no Chrome; E2E_BASE_URL to test somewhere other than http://localhost:8080.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:8080',
    channel: process.env['E2E_CHANNEL'] ?? 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true },
    },
    { name: 'desktop', use: { viewport: { width: 1400, height: 850 } } },
  ],
});
