import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: {
    actionTimeout: 10000,
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: 'list',
});
