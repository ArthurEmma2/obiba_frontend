import { defineConfig, devices } from '@playwright/test';

const env = {
  NEXT_PUBLIC_APP_ORIGIN: 'http://localhost:3100',
  NEXT_PUBLIC_SITE_URL: 'https://www.obibajk.com',
  NEXT_PUBLIC_SUPPORT_EMAIL: 'hello@obibajk.com',
  NEXT_PUBLIC_API_URL: 'http://localhost:3999/graphql',
  NEXT_PUBLIC_NEAR_NETWORK: 'sandbox',
  NEXT_PUBLIC_ACCOUNT_SUFFIX: '.obiba.near',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'preview-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'preview.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'obiba-preview',
  NEXT_PUBLIC_GRAPHQL_SEND_QUERY: '1',
};

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3100', channel: 'chrome', trace: 'off' },
  webServer: { command: 'npx next dev --port 3100', url: 'http://localhost:3100/sign-in', reuseExistingServer: false, timeout: 180_000, env },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
});
