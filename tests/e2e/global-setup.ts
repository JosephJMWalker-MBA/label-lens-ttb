import { chromium, type FullConfig } from "@playwright/test";

import { SAMPLE_ENVELOPE } from "./fixtures/precheck-sample";

/**
 * Warm the dev server's on-demand compilation once, serially, before the
 * parallel test workers start.
 *
 * `next dev` compiles each route/page on first request. When several workers hit
 * a cold server at once, that first compile can be slow enough — and can trigger
 * a Fast-Refresh reload — to hang the first navigation on a busy CI runner. This
 * setup drives the whole success path once (home page, the onboarding sample run
 * with a stubbed pre-check, the real ResultView render, and the sample-image
 * route) so everything is compiled before the suite runs. It is a cheap no-op
 * when the server is already warm (local runs).
 *
 * Warming is entirely best-effort: any failure is logged and swallowed so it can
 * never fail the suite (each test still has its own timeouts).
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects[0]?.use?.baseURL ?? `http://localhost:${process.env.PORT ?? 3000}`;

  const started = Date.now();
  console.log(`[global-setup] warming ${baseURL} ...`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    await page.route("**/api/precheck", (route) =>
      route.fulfill({ status: 200, json: SAMPLE_ENVELOPE }),
    );
    await page.goto("/", { waitUntil: "load", timeout: 180_000 });
    // Let the onboarding sample complete so ResultView + the sample-image route
    // compile. The heading appears on the success path.
    await page
      .getByRole("heading", { name: /pre-check result/i })
      .waitFor({ state: "visible", timeout: 180_000 });
    await page.request.get("/api/sample-image");
    console.log(`[global-setup] warm complete in ${Date.now() - started}ms`);
  } catch (error) {
    console.warn(`[global-setup] warm-up skipped (${(error as Error).message}); tests continue.`);
  } finally {
    await browser.close();
  }
}
