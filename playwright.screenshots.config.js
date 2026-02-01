// @ts-check
/**
 * Config for capturing quickstart screenshots. Starts the app so the test
 * runs against http://localhost:36001. Run:
 *   npx playwright test e2e/capture-quickstart-screenshots.spec.js -c playwright.screenshots.config.js
 */
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 180000,
  use: {
    baseURL: 'http://localhost:36001',
    trace: 'off',
    headless: true,
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:36001',
    timeout: 120000,
    reuseExistingServer: true,
  },
});
