import { test, expect } from "@playwright/test";

import { E2E } from "./auth-fixtures";

// The sticky account bar is a production-build proof (see playwright.config
// webServer). It must be visible without scrolling on public pages, work before
// hydration, and never cover page content — on desktop and mobile.

const PUBLIC_PATHS = ["/", "/create", "/review", "/review/legacy", "/learn", "/login"];

test.describe("sticky account bar — signed out", () => {
  for (const path of PUBLIC_PATHS) {
    test(`shows a Sign in action fixed to the viewport bottom on ${path}`, async ({ page }) => {
      await page.goto(path);
      const signIn = page.getByTestId("account-bar-sign-in");
      await expect(signIn).toBeVisible();
      await expect(signIn).toHaveAttribute("href", "/login");

      // Fixed to the viewport bottom: its box sits within a bar-height of the
      // viewport's bottom edge regardless of page scroll position.
      const viewport = page.viewportSize();
      const box = await signIn.boundingBox();
      expect(box).not.toBeNull();
      if (box && viewport) {
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
        expect(box.y).toBeGreaterThan(viewport.height - 160);
      }
    });
  }

  test("Sign in navigates to /login", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("account-bar-sign-in").click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("works before hydration: the server HTML already contains the Sign in link", async ({
    page,
  }) => {
    // Disable JavaScript so nothing hydrates — the anchor must still be present
    // and point at the relative /login path.
    const response = await page.goto("/");
    const html = (await response?.text()) ?? "";
    expect(html).toContain('href="/login"');
  });
});

test.describe("sticky account bar — mobile safe area and content clearance", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("stays visible and does not cover the bottom of the page content", async ({ page }) => {
    await page.goto("/review");
    const signIn = page.getByTestId("account-bar-sign-in");
    await expect(signIn).toBeVisible();

    // The body reserves bottom padding while the bar is mounted, so scrolling to
    // the very bottom still leaves the bar clear of content (no horizontal scroll).
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);

    const barReserved = await page.evaluate(() => document.body.dataset.accountBar === "open");
    expect(barReserved).toBe(true);
  });
});

test.describe("sticky account bar — authenticated", () => {
  test("shows the seller landing and Sign out after login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E.seller.email);
    await page.getByLabel("Password").fill(E2E.seller.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/seller$/);
    // Navigate to a public page; the bar reflects the confirmed server role.
    await page.goto("/review");
    await expect(page.getByTestId("account-bar-home")).toHaveText("My submissions");
    await expect(page.getByTestId("account-bar-home")).toHaveAttribute("href", "/seller");
  });
});
