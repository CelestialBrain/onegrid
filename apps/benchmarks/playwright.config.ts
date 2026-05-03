import { defineConfig } from '@playwright/test';

const PLAYGROUND_URL = 'http://localhost:5173';
const SSRM_URL = 'http://localhost:3001';

/**
 * The harness auto-starts both the playground (vite dev) and the SSRM mock
 * server (Node http) so a fresh checkout can run benchmarks with one
 * command. `reuseExistingServer` lets local dev keep its long-running
 * vite server alive between runs.
 */
export default defineConfig({
  testDir: './src',
  fullyParallel: false, // Perf scenarios deserve isolated runs
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: PLAYGROUND_URL,
    headless: true,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  },
  webServer: [
    {
      command: 'pnpm --filter @onegrid/playground dev',
      url: PLAYGROUND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @onegrid/ssrm-mock-server dev',
      url: `${SSRM_URL}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
