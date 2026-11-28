import { defineConfig, devices } from '@playwright/test';
import { E2E_ADMIN_KEY } from './tests/e2e/admin-session';

// The suite runs against the built static export by default. E2E_DEV=1 runs it
// against `next dev` instead, for iterating on a spec without rebuilding.
const dev = process.env.E2E_DEV === '1';
const baseURL = dev ? 'http://localhost:3001' : 'http://127.0.0.1:3002';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: dev
    ? {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      }
    : {
        // The real XRDB binary serving internal/ui/dist, building the export
        // only when missing. Run `npm run build` first to test current code.
        command: 'bash scripts/e2e-server.sh',
        url: `${baseURL}/healthz`,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        env: { XRDB_E2E_ADMIN_KEY: E2E_ADMIN_KEY },
        gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      },
});
