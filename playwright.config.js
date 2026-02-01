// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  testIgnore: ['**/capture-quickstart-screenshots.spec.js'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:36001',
    trace: 'on-first-retry',
    headless: true,
    video: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run start:server',
      url: 'http://localhost:36000/api/sessions',
      timeout: 15000,
      reuseExistingServer: true,
      env: { ...process.env, PORT: '36000' },
    },
    {
      command: 'npm run start:client',
      url: 'http://localhost:36001',
      timeout: 60000,
      reuseExistingServer: true,
    },
  ],
});
