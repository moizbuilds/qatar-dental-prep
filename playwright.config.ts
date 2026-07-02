import { defineConfig } from "@playwright/test";

/**
 * E2E smoke tests. Assumes the app is already running at BASE_URL
 * (default http://localhost:3000) with the DB loaded and APP_PASSCODE set.
 * Run: npm run dev  (in one terminal)  then  npm run test:e2e.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    headless: true,
  },
});
