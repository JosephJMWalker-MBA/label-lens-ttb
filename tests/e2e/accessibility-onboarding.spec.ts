import { expect, test } from "@playwright/test";

/**
 * Onboarding and appearance foundation (#52/#53). These drive the real browser:
 * a first-time user sees the introduction, can skip it, and can change theme and
 * text size, with the choice persisted across a reload. No backend performance
 * behavior is asserted here.
 */

test("first-use onboarding appears, is skippable, and can be replayed", async ({ page }) => {
  // The introduction describes the pre-check workflow, so it greets a first-time
  // visitor on the route that offers that workflow — not on the intent hub.
  await page.goto("/review/legacy");

  const dialog = page.getByRole("dialog", { name: /upload a wine label/i });
  await expect(dialog).toBeVisible();
  await expect(page.getByText(/step 1 of 5/i)).toBeVisible();

  // Skip returns to the workflow; the intro does not block the primary upload.
  await page.getByRole("button", { name: /skip introduction/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel(/select one label image/i)).toBeVisible();

  // A reload does not show it again (completion is remembered locally).
  await page.reload();
  await expect(page.getByRole("dialog", { name: /upload a wine label/i })).toBeHidden();

  // It can be replayed from the settings surface.
  await page.getByRole("button", { name: /display settings/i }).click();
  await page.getByRole("button", { name: /view introduction again/i }).click();
  await expect(page.getByRole("dialog", { name: /upload a wine label/i })).toBeVisible();
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
