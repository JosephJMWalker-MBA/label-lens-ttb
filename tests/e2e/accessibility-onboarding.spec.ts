import { expect, test, type Page } from "@playwright/test";

import { SAMPLE_ENVELOPE } from "./fixtures/precheck-sample";

/**
 * Productive cold-start onboarding and appearance foundation (#52/#53/#56).
 *
 * These drive the real browser: a first-time visitor gets the productive
 * cold-start workspace, which runs the verified sample once through the real
 * pre-check path, shows the exact analyzed artwork, reveals the result, and
 * hands off to the user's own upload; it is skippable, remembered, and
 * replayable (without a second sample request); a failed sample is surfaced
 * honestly; the persistent purple Reviewer demo action opens an honest preview;
 * cold/warm-sequence timing is measured; and theme/text-size choices persist.
 *
 * The `/api/precheck` call is stubbed so these deterministically exercise
 * onboarding orchestration rather than live OCR timing (the real pipeline sample
 * is covered end-to-end in the home spec). `/api/sample-image` is left real so
 * the artwork is the genuine bundled fixture.
 */

const ONBOARDING_TITLE = /warming up on a verified sample/i;
const TIMING_KEY = "label-lens.precheck-timing.v1";
const UPLOAD_FIXTURE = "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg";

/** Route the pre-check to a deterministic response after a short delay. */
async function stubPrecheck(page: Page, opts?: { fail?: boolean }) {
  await page.route("**/api/precheck", async (route) => {
    await new Promise((r) => setTimeout(r, 150));
    if (opts?.fail) {
      await route.fulfill({
        status: 500,
        json: { ok: false, error: { code: "X", message: "boom" } },
      });
    } else {
      await route.fulfill({ status: 200, json: SAMPLE_ENVELOPE });
    }
  });
}

/** Read the browser-stored timing contract (the deterministic test hook). */
async function readTiming(page: Page) {
  return page.evaluate((key) => {
    try {
      return JSON.parse(sessionStorage.getItem(key) || "{}");
    } catch {
      return {};
    }
  }, TIMING_KEY);
}

test("first visit runs the sample, shows the analyzed artwork, reveals it, and measures timing", async ({
  page,
}) => {
  await stubPrecheck(page);
  await page.goto("/");

  const dialog = page.getByRole("dialog", { name: ONBOARDING_TITLE });
  await expect(dialog).toBeVisible();

  // The exact bundled artwork is shown while the sample runs.
  await expect(page.getByAltText(/bundled verified m cellars sample label/i)).toBeVisible();

  // Honest, client-provable status reaches the terminal states.
  await expect(page.getByText("VERIFIED SAMPLE REQUESTED")).toBeVisible();
  await expect(page.getByText("SAMPLE READY")).toBeVisible();
  await expect(page.getByText("READY FOR YOUR LABEL")).toBeVisible();

  // No fabricated internal OCR sub-stage, and no unsupported "warm" claim.
  await expect(page.getByText(/MAPPING BRAND EVIDENCE/i)).toHaveCount(0);
  await expect(page.getByText(/service is warm/i)).toHaveCount(0);
  await expect(page.getByText(/verified sample request completed/i)).toBeVisible();

  // The real result is revealed, now with the analyzed artwork for overlays.
  await expect(page.getByText(/verified sample result/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /pre-check result/i })).toBeVisible();
  await expect(page.getByAltText(/M Cellars verified sample/i)).toBeVisible();

  // Timing lifecycle: shell, sample request, and first trustworthy result recorded.
  const t1 = await readTiming(page);
  expect(typeof t1.shellReadyMs).toBe("number");
  expect(typeof t1.sampleRequestMs).toBe("number");
  expect(typeof t1.firstTrustworthyResultMs).toBe("number");
  expect(t1.firstUploadAfterSampleMs).toBeNull();

  // Hand off to upload, then run a real upload; it records the after-sample bucket.
  await page.getByRole("button", { name: /upload your label/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel(/select one label image/i)).toBeFocused();

  await page.getByLabel(/select one label image/i).setInputFiles(UPLOAD_FIXTURE);
  await page.getByLabel(/application brand name/i).fill("M CELLARS");
  await page.getByLabel(/application alcohol value/i).fill("12.5");
  await page.getByRole("button", { name: /^run pre-check$/i }).click();
  await expect(page.getByText(/pre-check complete/i)).toBeVisible();

  const t2 = await readTiming(page);
  expect(typeof t2.firstUploadAfterSampleMs).toBe("number");
  expect(t2.firstUploadWithoutSampleMs).toBeNull();
});

test("onboarding is skippable, remembered, and replayable without a second sample request", async ({
  page,
}) => {
  let precheckCalls = 0;
  await page.route("**/api/precheck", async (route) => {
    precheckCalls += 1;
    await new Promise((r) => setTimeout(r, 150));
    await route.fulfill({ status: 200, json: SAMPLE_ENVELOPE });
  });
  await page.goto("/");

  const dialog = page.getByRole("dialog", { name: ONBOARDING_TITLE });
  await expect(dialog).toBeVisible();
  await expect(page.getByText("SAMPLE READY")).toBeVisible();

  // Skip returns to the workflow.
  await page.getByRole("button", { name: /skip introduction/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel(/select one label image/i)).toBeVisible();

  // Replay from settings in the same session: the status log is reconstructed and
  // the existing result is shown — and NO new sample request is made.
  const callsBeforeReplay = precheckCalls;
  await page.getByRole("button", { name: /display settings/i }).click();
  await page.getByRole("button", { name: /view introduction again/i }).click();
  await expect(dialog).toBeVisible();
  await expect(page.getByText("READY FOR YOUR LABEL")).toBeVisible();
  await expect(page.getByRole("heading", { name: /pre-check result/i })).toBeVisible();
  await expect(page.getByText(/the workflow you/i)).toBeVisible();
  expect(precheckCalls).toBe(callsBeforeReplay);

  // A full reload bypasses onboarding entirely (returning users).
  await page.reload();
  await expect(dialog).toBeHidden();
  expect(precheckCalls).toBe(callsBeforeReplay);
});

test("a returning user's direct upload records the without-sample timing bucket", async ({
  page,
}) => {
  await page.addInitScript(() =>
    window.localStorage.setItem("label-lens.onboarding.seen.v1", "true"),
  );
  await stubPrecheck(page);
  await page.goto("/");

  await page.getByLabel(/select one label image/i).setInputFiles(UPLOAD_FIXTURE);
  await page.getByLabel(/application brand name/i).fill("M CELLARS");
  await page.getByLabel(/application alcohol value/i).fill("12.5");
  await page.getByRole("button", { name: /^run pre-check$/i }).click();
  await expect(page.getByText(/pre-check complete/i)).toBeVisible();

  const t = await readTiming(page);
  expect(typeof t.firstUploadWithoutSampleMs).toBe("number");
  expect(t.sampleRequestMs).toBeNull();
  expect(t.firstUploadAfterSampleMs).toBeNull();
});

test("a failed sample is surfaced honestly and does not block upload", async ({ page }) => {
  await stubPrecheck(page, { fail: true });
  await page.goto("/");

  await expect(page.getByText("SAMPLE FAILED")).toBeVisible();
  await expect(page.getByRole("button", { name: /retry sample/i })).toBeVisible();
  // The primary path is still reachable despite the sample failure.
  await page.getByRole("button", { name: /upload your label/i }).click();
  await expect(page.getByLabel(/select one label image/i)).toBeFocused();
});

test("the persistent Reviewer demo action opens an honest preview", async ({ page }) => {
  await page.addInitScript(() =>
    window.localStorage.setItem("label-lens.onboarding.seen.v1", "true"),
  );
  await page.goto("/");

  await page.getByRole("button", { name: /reviewer demo/i }).click();
  const dialog = page.getByRole("dialog", { name: /what the reviewer receives/i });
  await expect(dialog).toBeVisible();
  await expect(page.getByText("READY FOR REVIEW")).toBeVisible();
  await expect(page.getByText(/demonstration only/i)).toBeVisible();
  await expect(page.getByText(/no live TTB integration/i)).toBeVisible();
  await page.getByRole("button", { name: /^close$/i }).click();
  await expect(dialog).toBeHidden();
});

test("appearance settings switch theme and text size and persist across reload", async ({
  page,
}) => {
  await page.addInitScript(() =>
    window.localStorage.setItem("label-lens.onboarding.seen.v1", "true"),
  );
  await page.goto("/");

  await page.getByRole("button", { name: /display settings/i }).click();
  await page.getByRole("radio", { name: /^dark$/i }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("radio", { name: /^large$/i }).check();
  await expect(page.locator("html")).toHaveAttribute("data-font-scale", "large");

  // The explicit choice survives a reload (persisted locally, applied before paint).
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-font-scale", "large");
});
