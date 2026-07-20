import { test, expect, type Page } from "@playwright/test";

import { E2E } from "./auth-fixtures";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("authenticated role-based portal", () => {
  test("agent logs in, reviews a submission, and loses access after logout", async ({ page }) => {
    await signIn(page, E2E.agent.email, E2E.agent.password);

    // Role-directed landing on the agent queue.
    await expect(page).toHaveURL(/\/agent$/);
    await expect(page.getByRole("heading", { name: "Submissions" })).toBeVisible();
    await expect(page.getByText("Waiting for agent review").first()).toBeVisible();

    // Open the seeded submission and see separated seller vs machine records.
    await page
      .getByRole("link", { name: /pkg-e2e-primary/ })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/agent/submissions/${E2E.primarySubmissionId}`));
    await expect(page.getByText(/Internal review record/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Immutable revision" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Seller evidence" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Machine observations" })).toBeVisible();
    await expect(page.getByText("Verified")).toBeVisible();

    // No official-approval language anywhere on the page.
    const body = (await page.textContent("body")) ?? "";
    expect(body).not.toMatch(/TTB approved|COLA approved|Government approved|Regulatory accepted/i);

    // Log out → back to /login, and the protected route is no longer accessible.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/agent");
    await expect(page).toHaveURL(/\/login/);
  });

  test("seller cannot reach the agent queue and cannot read another seller's submission", async ({
    page,
  }) => {
    await signIn(page, E2E.seller.email, E2E.seller.password);
    await expect(page).toHaveURL(/\/seller$/);

    // Sellers are turned away from the agent area.
    await page.goto("/agent");
    await expect(page).toHaveURL(/\/unauthorized|\/login/);

    // Cross-seller status access returns a safe 404 (no existence leak).
    const own = await page.request.get(`/api/package/submit/status/${E2E.primarySubmissionId}`);
    expect(own.status()).toBe(200);
    const other = await page.request.get(`/api/package/submit/status/${E2E.otherSubmissionId}`);
    expect(other.status()).toBe(404);

    // Sellers cannot call the agent queue API.
    const queue = await page.request.get("/api/agent/submissions");
    expect(queue.status()).toBe(403);
  });

  test("admin reaches the admin landing and opens the agent queue", async ({ page }) => {
    await signIn(page, E2E.admin.email, E2E.admin.password);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();

    await page.getByRole("link", { name: "Open agent queue" }).click();
    await expect(page).toHaveURL(/\/agent$/);
    await expect(page.getByRole("heading", { name: "Submissions" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("anonymous visitors are redirected from protected pages and denied by the API", async ({
    page,
  }) => {
    await page.goto("/agent");
    await expect(page).toHaveURL(/\/login/);

    const res = await page.request.get("/api/agent/submissions");
    expect(res.status()).toBe(401);
  });
});
