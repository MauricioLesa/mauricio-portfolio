import { defineConfig, devices } from '@playwright/test';

// When PLAYWRIGHT_BASE_URL is set, run against that deployed site and don't start a local server.
const deployedUrl = process.env.PLAYWRIGHT_BASE_URL;
const port = 3000;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: deployedUrl ?? `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
    { name: 'mobile-pixel-7', use: { ...devices['Pixel 7'] } },
  ],
  webServer: deployedUrl
    ? undefined
    : {
        command: 'npm run build && npm start',
        url: `http://localhost:${port}`,
        env: { AWS_MODE: 'fake' },
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
