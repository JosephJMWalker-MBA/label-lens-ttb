import { chromium, type FullConfig } from "@playwright/test";

/**
 * Warm the dev server's on-demand compilation once, serially, before the
 * parallel test workers start.
 *
 * `next dev` compiles each route on first request. When the onboarding renders
 * the `/api/sample-image` <img>, that route compiles on demand — and on a busy
 * CI runner that can trigger a Fast-Refresh page reload mid-render, hanging the
 * navigation. To avoid it, we compile every on-demand route up front via
 * page-less requests (so there is no open page to reload), then load the shell
 * once with onboarding marked seen (so the warm-up load itself never renders the
 * sample path). After this, the routes and the client bundle are all compiled,
 * so the real tests hit a fully warm server with no on-demand recompilation.
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
    const context = await browser.newContext({ baseURL });
    // The warm-up page load must not run the onboarding (which would render the
    // sample <img> and race on-demand compilation); mark it seen.
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem("label-lens.onboarding.seen.v1", "true");
      } catch {
        /* storage unavailable */
      }
    });
    const page = await context.newPage();

    // Compile the on-demand routes with page-less requests (any status is fine).
    await page.request.get("/api/sample-image").catch(() => {});
    // A non-multipart POST returns 415 before any OCR, but still compiles the route.
    await page.request.post("/api/precheck", { data: "warm" }).catch(() => {});

    // Warm the page and the full client bundle (ResultView is statically imported,
    // so it compiles here). No onboarding overlay, no sample <img>, no reload.
    await page.goto("/", { waitUntil: "load", timeout: 180_000 });
    await page.getByLabel(/select one label image/i).waitFor({ state: "visible", timeout: 60_000 });

    console.log(`[global-setup] warm complete in ${Date.now() - started}ms`);
    await context.close();
  } catch (error) {
    console.warn(
      `[global-setup] warm-up incomplete (${(error as Error).message}); tests continue.`,
    );
  } finally {
    await browser.close();
  }
}
