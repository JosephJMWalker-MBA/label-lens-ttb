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
  // On a cold CI runner, Next dev compiles the client bundle on demand on the
  // first page load. Give assertions headroom for that one-time compile, and cap
  // worker contention in CI so the first parallel loads don't race the compile.
  timeout: 90_000,
  expect: { timeout: 30_000 },
  workers: process.env.CI ? 2 : undefined,
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
    timeout: 120_000,
  },
});
