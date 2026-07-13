import { defineConfig, devices } from "@playwright/test";

// Port is overridable so a worktree can run its own dev server without colliding
// with another checkout's server (set PORT to a free port, e.g. 3100).
const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Warm the dev server's on-demand compilation once, serially, before the
  // parallel workers start — otherwise the first cold loads race Next dev's
  // route compilation (which can trigger a Fast-Refresh reload and hang the
  // first navigation on a slow CI runner). Headroom timeouts back this up.
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
