import { test, expect, type Page } from "@playwright/test";

import { E2E } from "./auth-fixtures";

// These run against the production build (see playwright.config webServer). They
// prove the guided `/review` workspace is usable on a direct cold load and that a
// local-draft failure never blocks package preparation. Assertions check that the
// real upload control becomes usable — not merely that a loading string vanished.

const UPLOAD_CONTROL = "Upload front label";

async function expectWorkspaceUsable(page: Page) {
  await expect(page.getByTestId("seller-workstation")).toBeVisible();
  await expect(page.getByLabel(UPLOAD_CONTROL)).toBeVisible();
  await expect(page.getByLabel(UPLOAD_CONTROL)).toBeEnabled();
  // The old blocking gate text must never be present.
  await expect(page.getByText(/Restoring the locally saved package draft/i)).toHaveCount(0);
}

// Force IndexedDB.open to return a request that never fires an event.
async function stallIndexedDb(page: Page) {
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
}

async function removeIndexedDb(page: Page) {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    } catch {
      // ignore
    }
  });
}

test.describe("resilience: /review cold load is reliable on the production build", () => {
  test("1+9. fresh context, hard load /review with empty IndexedDB — usable, no warning", async ({
    page,
  }) => {
    await page.goto("/review");
    await expectWorkspaceUsable(page);
    // A normal first visit shows no failure warning.
    await expect(page.getByTestId("restoration-warning")).toHaveCount(0);
  });

  test("3. IndexedDB unavailable — workspace usable with a non-destructive warning", async ({
    page,
  }) => {
    await removeIndexedDb(page);
    await page.goto("/review");
    await expectWorkspaceUsable(page);
    await expect(page.getByTestId("restoration-warning")).toBeVisible();
    await expect(page.getByText(/was not deleted/i)).toBeVisible();
  });

  test("2+4+10. IndexedDB open never resolves — usable immediately, warning after bounded deadline", async ({
    page,
  }) => {
    await stallIndexedDb(page);
    await page.goto("/review");
    // Usable immediately, before any deadline — the page is not gated on IndexedDB.
    await expectWorkspaceUsable(page);
    // The bounded restoration deadline then surfaces a non-destructive warning.
    await expect(page.getByTestId("restoration-warning")).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText(/could not restore the locally saved draft/i)).toBeVisible();
    // The workspace remains usable after the failure.
    await expectWorkspaceUsable(page);
  });

  test("6. a late result after fallback does not flip the usable fallback", async ({ page }) => {
    await stallIndexedDb(page);
    await page.goto("/review");
    await expect(page.getByTestId("restoration-warning")).toBeVisible({ timeout: 12_000 });
    await expectWorkspaceUsable(page);
    // Wait past any late-recovery window: the fallback persists and stays usable.
    await page.waitForTimeout(3000);
    await expect(page.getByTestId("restoration-warning")).toBeVisible();
    await expectWorkspaceUsable(page);
  });

  test("7. retry after fallback re-attempts restoration", async ({ page }) => {
    await stallIndexedDb(page);
    await page.goto("/review");
    const retry = page.getByRole("button", { name: "Retry local draft restoration" });
    await expect(retry).toBeVisible({ timeout: 12_000 });
    await retry.click();
    // Still usable after retrying; the retry re-runs without breaking the page.
    await expectWorkspaceUsable(page);
  });

  test("8. /review/legacy → click Prepare a package → guided workspace loads", async ({ page }) => {
    // The legacy route auto-opens the pre-check introduction for a first-time
    // visitor, whose overlay would intercept the navigation click.
    await page.addInitScript(() =>
      window.localStorage.setItem("label-lens.onboarding.seen.v1", "true"),
    );
    await page.goto("/review/legacy");
    await page.getByRole("link", { name: "Prepare a package" }).first().click();
    await expect(page).toHaveURL(/\/review$/);
    await expectWorkspaceUsable(page);
  });
});

test.describe("resilience: public Sign in stays available", () => {
  test("Sign in stays visible while /api/auth/get-session is delayed", async ({ page }) => {
    await page.route("**/api/auth/get-session*", async (route) => {
      await new Promise((r) => setTimeout(r, 4000));
      await route.continue();
    });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  });

  test("Sign in stays visible and functional when get-session fails", async ({ page }) => {
    await page.route("**/api/auth/get-session*", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );
    await page.goto("/");
    const signIn = page.getByRole("link", { name: "Sign in" }).first();
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
    await expect(page.getByRole("button", { name: "Sign out" }).first()).toBeVisible();
  });
});
