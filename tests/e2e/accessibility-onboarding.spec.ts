import { expect, test, type Page } from "@playwright/test";

import { SAMPLE_ENVELOPE } from "./fixtures/precheck-sample";

/**
 * Productive cold-start onboarding and appearance foundation (#52/#53/#56).
 *
 * These drive the real browser: a first-time visitor gets the productive
 * cold-start workspace, which runs the verified sample once through the real
 * pre-check path, reveals it, and hands off to the user's own upload; it is
 * skippable, remembered, and replayable; a failed sample is surfaced honestly;
 * the persistent purple Reviewer demo action opens an honest preview; and theme
 * and text-size choices persist across a reload.
 *
 * The `/api/precheck` sample call is stubbed so these deterministically exercise
 * onboarding orchestration rather than live OCR timing (the real pipeline sample
 * is covered end-to-end in the home spec).
 */

const ONBOARDING_TITLE = /warming up on a verified sample/i;

/** Route the sample pre-check to a deterministic response after a short delay. */
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

test("first visit runs the verified sample, reveals it, and hands off to upload", async ({
  page,
}) => {
  await stubPrecheck(page);
  await page.goto("/");

  const dialog = page.getByRole("dialog", { name: ONBOARDING_TITLE });
  await expect(dialog).toBeVisible();

  // Honest, client-provable status reaches the terminal states.
  await expect(page.getByText("VERIFIED SAMPLE REQUESTED")).toBeVisible();
  await expect(page.getByText("SAMPLE READY")).toBeVisible();
  await expect(page.getByText("READY FOR YOUR LABEL")).toBeVisible();

  // No fabricated internal OCR sub-stage is presented as status.
  await expect(page.getByText(/MAPPING BRAND EVIDENCE/i)).toHaveCount(0);
  await expect(page.getByText(/ASSEMBLING TRACEABLE REPORT/i)).toHaveCount(0);

  // The real result is revealed inside the onboarding.
  await expect(page.getByText(/verified sample result/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /pre-check result/i })).toBeVisible();

  // Upload your label closes onboarding and focuses the real file input.
  await page.getByRole("button", { name: /upload your label/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel(/select one label image/i)).toBeFocused();
});

test("onboarding is skippable, remembered, and replayable from settings", async ({ page }) => {
  await stubPrecheck(page);
  await page.goto("/");

  const dialog = page.getByRole("dialog", { name: ONBOARDING_TITLE });
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: /skip introduction/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel(/select one label image/i)).toBeVisible();

  // A reload does not show it again (returning users bypass the walkthrough).
  await page.reload();
  await expect(dialog).toBeHidden();

  // It can be replayed from the settings surface.
  await page.getByRole("button", { name: /display settings/i }).click();
  await page.getByRole("button", { name: /view introduction again/i }).click();
  await expect(dialog).toBeVisible();
});

test("a failed sample is surfaced honestly and does not block upload", async ({ page }) => {
  await stubPrecheck(page, { fail: true });
  await page.goto("/");

  await expect(page.getByText("SAMPLE FAILED")).toBeVisible();
  await expect(page.getByRole("button", { name: /retry sample/i })).toBeVisible();
  // The primary path is still reachable despite the warm-up failure.
  await page.getByRole("button", { name: /upload your label/i }).click();
  await expect(page.getByLabel(/select one label image/i)).toBeFocused();
});

test("the persistent Reviewer demo action opens an honest preview", async ({ page }) => {
  // A returning user sees the main app with the persistent reviewer action.
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
