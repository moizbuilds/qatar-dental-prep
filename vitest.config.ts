import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Playwright specs under tests/e2e are run by `npm run test:e2e`, not Vitest.
    exclude: ["**/node_modules/**", "**/.next/**", "tests/e2e/**"],
  },
});
