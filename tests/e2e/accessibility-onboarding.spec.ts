import { expect, test } from "@playwright/test";

/**
 * Onboarding and appearance foundation (#52/#53). These drive the real browser:
 * a first-time user sees the introduction, can skip it, and can change theme and
 * text size, with the choice persisted across a reload. No backend performance
 * behavior is asserted here.
 */

test("first-use onboarding appears on entry route /, is skippable, sets v2 storage, and can be replayed", async ({
  page,
}) => {
  await page.goto("/");

  const dialog = page.getByRole("dialog", {
    name: /upload label panels and record seller evidence/i,
  });
  await expect(dialog).toBeVisible();
  await expect(page.getByText(/step 1 of 4/i)).toBeVisible();

  // Before dismissal, v2 key is absent.
  const beforeSeen = await page.evaluate(() =>
    window.localStorage.getItem("label-lens.onboarding.seen.v2"),
  );
  expect(beforeSeen).toBeNull();

  // Skip returns to the page; completion is remembered in v2.
  await page.getByRole("button", { name: /skip introduction/i }).click();
  await expect(dialog).toBeHidden();

  const afterSeen = await page.evaluate(() =>
    window.localStorage.getItem("label-lens.onboarding.seen.v2"),
  );
  expect(afterSeen).toBe("true");

  // Reload does not show it again.
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: /upload label panels and record seller evidence/i }),
  ).toBeHidden();

  // Replay from Display Settings surface works.
  await page.getByRole("button", { name: /display settings/i }).click();
  await page.getByRole("button", { name: /view introduction again/i }).click();
  await expect(
    page.getByRole("dialog", { name: /upload label panels and record seller evidence/i }),
  ).toBeVisible();
});

test("dismissing onboarding on / prevents auto-open on /review while /review/legacy never auto-opens", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /skip introduction/i }).click();

  // Direct visit to /review after dismissal stays clean.
  await page.goto("/review");
  await expect(page.getByRole("dialog")).toBeHidden();

  // Direct visit to /review/legacy never auto-opens onboarding even with clean storage.
  await page.addInitScript(() => window.localStorage.removeItem("label-lens.onboarding.seen.v2"));
  await page.goto("/review/legacy");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("v2 onboarding migration preserves old v1 key, preferences, and unrelated storage byte-for-byte", async ({
  page,
}) => {
  const fullPrefs = JSON.stringify({ theme: "dark", fontScale: "default", motion: "system" });
  await page.addInitScript((prefsJson) => {
    window.localStorage.setItem("label-lens.onboarding.seen.v1", "true");
    window.localStorage.setItem("label-lens.preferences.v1", prefsJson);
    window.localStorage.setItem("unrelated_app_data", "preserved_exact");
  }, fullPrefs);

  await page.goto("/");
  await page.getByRole("button", { name: /skip introduction/i }).click();

  const storage = await page.evaluate(() => ({
    v1: window.localStorage.getItem("label-lens.onboarding.seen.v1"),
    v2: window.localStorage.getItem("label-lens.onboarding.seen.v2"),
    prefs: window.localStorage.getItem("label-lens.preferences.v1"),
    unrelated: window.localStorage.getItem("unrelated_app_data"),
  }));

  expect(storage.v1).toBe("true");
  expect(storage.v2).toBe("true");
  expect(storage.prefs).toBe(fullPrefs);
  expect(storage.unrelated).toBe("preserved_exact");
});

test("public header wraps cleanly without horizontal scroll at 390x844", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    window.localStorage.setItem("label-lens.onboarding.seen.v2", "true"),
  );
  await page.goto("/");

  const header = page.getByRole("banner");
  await expect(header).toBeVisible();

  // Navigation links are ordered Prepare a package -> Create a label -> Learn requirements
  const sectionNav = page.getByRole("navigation", { name: /sections/i });
  await expect(sectionNav.getByRole("link", { name: /prepare a package/i })).toBeVisible();
  await expect(sectionNav.getByRole("link", { name: /create a label/i })).toBeVisible();
  await expect(sectionNav.getByRole("link", { name: /learn requirements/i })).toBeVisible();
  await expect(sectionNav.getByRole("link", { name: /single-image pre-check/i })).toHaveCount(0);

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(390);
});

test("appearance settings switch theme and text size and persist across reload", async ({
  page,
}) => {
  await page.addInitScript(() =>
    window.localStorage.setItem("label-lens.onboarding.seen.v2", "true"),
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
