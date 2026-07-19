import { test, expect } from "@playwright/test";

import { E2E } from "./auth-fixtures";

test.describe("resilience: non-blocking restoration and always-visible Sign in", () => {
  test("/review becomes usable with a warning when IndexedDB never settles", async ({ page }) => {
    // Block IndexedDB open forever: the returned request never fires an event.
    await page.addInitScript(() => {
      try {
        Object.defineProperty(window, "indexedDB", {
          configurable: true,
          value: { open: () => ({}) },
        });
      } catch {
        // ignore
      }
    });

    await page.goto("/review");
    // The workstation appears within the bounded deadline instead of hanging.
    await expect(page.getByTestId("seller-workstation")).toBeVisible({ timeout: 12000 });
    await expect(page.getByTestId("restoration-warning")).toBeVisible();
    await expect(page.getByText(/could not restore the locally saved draft/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry local draft restoration" })).toBeVisible();
  });

  test("the fallback workstation stays usable and is not flipped by a late event", async ({
    page,
  }) => {
    // IndexedDB open never settles → the workstation falls back within the bounded
    // deadline. The fallback (which would hold any in-progress seller work) must
    // stay usable and must not be silently replaced by a late recovery.
    await page.addInitScript(() => {
      try {
        Object.defineProperty(window, "indexedDB", {
          configurable: true,
          value: { open: () => ({}) },
        });
      } catch {
        // ignore
      }
    });

    await page.goto("/review");
    await expect(page.getByTestId("restoration-warning")).toBeVisible({ timeout: 12000 });
    // The workstation is interactive: the front-label upload control is available.
    await expect(page.getByLabel("Upload front label")).toBeVisible();

    // Wait past any late recovery window: the fallback state persists (a late
    // result would clear the warning / replace the draft) and stays usable.
    await page.waitForTimeout(3000);
    await expect(page.getByTestId("restoration-warning")).toBeVisible();
    await expect(page.getByLabel("Upload front label")).toBeVisible();
    await expect(page.getByText(/Restoring the locally saved/i)).toHaveCount(0);
  });

  test("Sign in stays visible while /api/auth/get-session is delayed", async ({ page }) => {
    await page.route("**/api/auth/get-session*", async (route) => {
      await new Promise((r) => setTimeout(r, 4000));
      await route.continue();
    });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("Sign in stays visible and functional when get-session fails", async ({ page }) => {
    await page.route("**/api/auth/get-session*", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );
    await page.goto("/");
    const signIn = page.getByRole("link", { name: "Sign in" });
    await expect(signIn).toBeVisible();
    await signIn.click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("successful agent login still updates navigation", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E.agent.email);
    await page.getByLabel("Password").fill(E2E.agent.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/agent$/);
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });
});
