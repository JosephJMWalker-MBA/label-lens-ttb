import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Bounded parallelism keeps the single Next dev server from being overwhelmed
  // by concurrent first-request route compilation, which otherwise makes
  // navigation-heavy flows (login redirects) flaky under load.
  workers: process.env.CI ? 2 : undefined,
  reporter: "list",
  // Generous timeouts absorb on-demand dev-server compilation latency the first
  // time each route is hit; they are not a substitute for correct behavior.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
