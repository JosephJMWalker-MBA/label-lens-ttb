import { expect, test, type Page } from "@playwright/test";

import { E2E } from "./auth-fixtures";

const FRONT_FIXTURE = "tests/fixtures/precheck/approved-wine-001/label.png";

/**
 * The finalize/resubmit routes cryptographically recompute each panel's
 * machineResultId and verify a server-issued HMAC append token (see
 * finalize/route.ts step 8), so /api/package/analyze cannot be mocked for any
 * test that reaches real submission — a forged observation is rejected as
 * "Invalid server provenance token". This test therefore runs the real OCR
 * pipeline and drives the seller workflow's single sticky footer action
 * through whatever the machine actually observes (match or mismatch), rather
 * than asserting a specific OCR outcome.
 */

function footerButton(page: Page) {
  return page.getByTestId("package-progress-footer").getByRole("button");
}

async function dragRegion(page: Page) {
  const canvas = page.getByRole("img", { name: /label annotation image/i });
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  const existingRegionCount = await page.locator("g[data-region-id]").count();
  const drawButton = page.getByRole("button", { name: /draw region/i });
  if ((await drawButton.getAttribute("aria-pressed")) !== "true") {
    await drawButton.click();
  }
  await canvas.hover({ position: { x: box!.width * 0.12, y: box!.height * 0.12 } });
  await page.mouse.down();
  await canvas.hover({ position: { x: box!.width * 0.72, y: box!.height * 0.62 } });
  await expect(page.locator("g[data-region-id]")).toHaveCount(existingRegionCount + 1);
  await page.mouse.up();
}

async function completeCategory(page: Page, heading: string | RegExp, text: string) {
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await page.getByLabel(/what the label says/i).fill(text);
  await dragRegion(page);
  const button = footerButton(page);
  await expect(button).toBeEnabled();
  await button.click();
}

/**
 * Drives the sticky single-action footer (save -> pre-check -> reconcile any
 * machine/seller mismatch by explicitly keeping seller evidence -> re-save ->
 * re-check) until the package reaches the "prepare for agent review" stage.
 */
async function driveToReady(page: Page) {
  for (let step = 0; step < 8; step += 1) {
    if (await page.getByTestId("prepare-workspace").isVisible()) return;
    const button = footerButton(page);
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled({ timeout: 150_000 });
    await button.click();
    await page.waitForTimeout(250);
  }
  await expect(page.getByTestId("prepare-workspace")).toBeVisible({ timeout: 150_000 });
}

/**
 * Better Auth's default production rate limit caps /sign-in requests at 3 per
 * 10-second window per IP (see getDefaultSpecialRules in better-auth). This
 * limiter is keyed by IP, not by test, so it is shared across every worker
 * signing in against the same local server — including other spec files
 * running concurrently. This lifecycle test alone signs in four times
 * (seller, agent, seller, agent), so a failed attempt is retried with backoff
 * rather than assumed to be a real auth defect.
 */
async function signIn(page: Page, email: string, password: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    const signedIn = await page
      .waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (signedIn) return;
    await page.waitForTimeout(11_000);
  }
  throw new Error(`Sign-in did not succeed for ${email} after retries.`);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

test.describe("golden-path internal review lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("label-lens.onboarding.seen.v2", "true");
      } catch {
        /* storage unavailable */
      }
    });
  });

  test("seller submits, agent requests changes, seller revises, agent internally accepts", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    const marker = `Golden Lifecycle ${crypto.randomUUID().slice(0, 8)}`;
    const changeRationale = `Please confirm the alcohol statement rounding — ${marker}`;
    const acceptRationale = `Corrected alcohol statement verified against panel — ${marker}`;
    const revisedAlcohol = `${marker} REVISED 13.0`;

    // ---- Seller: build and submit a fresh package via the primary /review workflow ----
    await signIn(page, E2E.seller.email, E2E.seller.password);
    await expect(page).toHaveURL(/\/seller$/);
    await page.getByTestId("start-new-package-btn").click();
    await expect(page).toHaveURL(/\/review$/);

    await page.getByLabel(/upload front label/i).setInputFiles(FRONT_FIXTURE);
    await page.getByRole("button", { name: /no back label/i }).click();
    await page.getByRole("button", { name: /no additional panels/i }).click();

    await completeCategory(page, "Brand name", marker);
    await completeCategory(page, "Alcohol statement", `${marker} 12.5`);

    // "Save draft locally" then "Run pre-check" — both single-action footer clicks.
    await footerButton(page).click();
    await expect(footerButton(page)).toHaveText(/run pre-check/i, { timeout: 15_000 });
    await footerButton(page).click();
    await driveToReady(page);

    const dock = page.getByTestId("agent-review-submission-dock");
    await page.locator("#agent-submission-name").fill(marker);
    await expect(page.getByRole("button", { name: "Submit for agent review" })).toBeEnabled();
    await page.getByRole("button", { name: "Submit for agent review" }).click();

    const submissionId = await dock.locator("p.font-mono").textContent({ timeout: 30_000 });
    expect(submissionId).toBeTruthy();
    const id = submissionId!.trim();

    await page.goto("/seller");
    await signOut(page);

    // ---- Agent: claim the submission and request changes ----
    await signIn(page, E2E.agent.email, E2E.agent.password);
    await expect(page).toHaveURL(/\/agent$/);
    await page.locator(`a[href="/agent/submissions/${id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/agent/submissions/${id}`));
    await expect(page.getByRole("heading", { name: "Immutable revision" })).toBeVisible();

    await page.getByRole("button", { name: "Claim review" }).click();
    await expect(page.getByText("In review", { exact: true }).first()).toBeVisible();

    await page.locator("#changes-rationale").fill(changeRationale);
    await page.getByRole("button", { name: "Request changes" }).click();
    await expect(page.getByText("Changes requested", { exact: true }).first()).toBeVisible();

    await signOut(page);

    // ---- Seller: see the request, revise a declared fact, and resubmit ----
    await signIn(page, E2E.seller.email, E2E.seller.password);
    await expect(page).toHaveURL(/\/seller$/);
    await page.goto(`/seller/submissions/${id}`);
    await expect(page.getByText("Requested changes")).toBeVisible();
    await expect(page.getByText(changeRationale)).toBeVisible();

    await page.getByRole("link", { name: "Respond with a revised package" }).click();
    await expect(page).toHaveURL(new RegExp(`/seller/submissions/${id}/revise`));
    await page.getByRole("button", { name: "Prepare local revision draft" }).click();
    await expect(page.getByRole("link", { name: "Open Review workspace" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("link", { name: "Open Review workspace" }).click();
    await expect(page).toHaveURL(/\/review$/);

    await page
      .getByLabel("Category progress")
      .getByRole("button", { name: /alcohol statement/i })
      .click();
    await page.getByRole("button", { name: "Edit confirmed text" }).click();
    await page.getByLabel(/what the label says/i).fill(revisedAlcohol);
    const editSaveButton = footerButton(page);
    await expect(editSaveButton).toBeEnabled();
    await editSaveButton.click();

    await expect(footerButton(page)).toHaveText(/save (updated )?draft/i, { timeout: 15_000 });
    await footerButton(page).click();
    await expect(footerButton(page)).toHaveText(/run pre-check/i, { timeout: 15_000 });
    await footerButton(page).click();
    await driveToReady(page);

    const revisionDock = page.getByTestId("agent-review-submission-dock");
    await expect(revisionDock.getByText(/responds to requested changes/i)).toBeVisible();
    await page.locator("#agent-submission-name").fill(marker);
    await page.getByRole("button", { name: "Submit for agent review" }).click();
    await expect(revisionDock.getByText("Revision v2 is recorded.")).toBeVisible({
      timeout: 30_000,
    });
    const resubmittedId = await revisionDock.locator("p.font-mono").textContent();
    expect(resubmittedId?.trim()).toBe(id);

    // The prior revision must remain visible and unmutated in the seller's own history.
    await page.goto(`/seller/submissions/${id}`);
    await expect(page.getByText("Revision v1", { exact: false })).toBeVisible();
    await expect(page.getByText("Revision v2", { exact: false })).toBeVisible();

    await signOut(page);

    // ---- Agent: see the correction on the new revision and internally accept ----
    await signIn(page, E2E.agent.email, E2E.agent.password);
    await expect(page).toHaveURL(/\/agent$/);
    await page.locator(`a[href="/agent/submissions/${id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/agent/submissions/${id}`));

    await expect(page.getByRole("heading", { name: "Revision response summary" })).toBeVisible();
    await expect(page.getByText(changeRationale)).toBeVisible();
    await expect(page.getByText(revisedAlcohol)).toBeVisible();

    // The resubmission reset the submission to "waiting for agent review", so
    // the new revision must be claimed again before a decision can be recorded.
    await page.getByRole("button", { name: "Claim review" }).click();
    await expect(page.getByText("In review", { exact: true }).first()).toBeVisible();

    await page.locator("#accept-rationale").fill(acceptRationale);
    await page.getByRole("button", { name: "Internally accept" }).click();
    await expect(
      page.getByText("Internally accepted for next step", { exact: true }).first(),
    ).toBeVisible();

    // ---- Final assertions: append-only history, both decisions present, no approval language ----
    const statusHistory = page.getByRole("heading", { name: "Status history" }).locator("..");
    await expect(statusHistory.getByText("Changes requested")).toBeVisible();
    await expect(statusHistory.getByText("Internally accepted for next step")).toBeVisible();

    const body = (await page.textContent("body")) ?? "";
    expect(body).not.toMatch(/TTB approved|COLA approved|Government approved|Regulatory accepted/i);

    // Immutability + continuity, from the agent's own accepted view: revision 2
    // is a distinct child of revision 1 (not a mutation of it), and the
    // decision it now carries is the internal-accept just recorded.
    await expect(
      page.getByText("Revision v2 responds to requested changes on revision v1."),
    ).toBeVisible();
  });
});
