import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { canonicalStringify } from "../../src/pipeline/export/json/canonical-stringify";

/**
 * The maker-first journey (#99): facts → summary → scaffold → export, in a real
 * browser. A maker who has no artwork and does not know all their answers can
 * still walk the whole flow and leave with a verifiable file.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    window.localStorage.setItem("label-lens.onboarding.seen.v1", "true"),
  );
});

async function enterWineFacts(page: import("@playwright/test").Page) {
  await page.getByLabel(/beverage type/i).selectOption("wine");
  await page.getByLabel(/brand name/i).fill("Cardinal Ridge");
  await page.getByLabel(/alcohol statement/i).fill("13.5% ALC./VOL.");
  await page.getByLabel(/net contents/i).fill("750 mL");
}

test("the hub now offers Create, and it reaches the facts intake", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /start from facts/i }).click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByRole("heading", { level: 1, name: /create a new label/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /tell us about your product/i })).toBeVisible();
});

test("a maker who knows nothing can still walk the whole journey", async ({ page }) => {
  await page.goto("/create");
  // No answers at all.
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(page.getByRole("heading", { name: /here is what you told us/i })).toBeVisible();
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(page.getByRole("heading", { name: /starter scaffold/i })).toBeVisible();
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(page.getByRole("heading", { name: /export your project/i })).toBeVisible();
});

test("only registry-backed fields are shown as required", async ({ page }) => {
  await page.goto("/create");
  await enterWineFacts(page);
  await page.getByRole("button", { name: /what you told us/i }).click();

  // Exactly the two seeded requirements, with the registry's own citations.
  await expect(page.getByText(/required by cited authority/i)).toHaveCount(2);
  await expect(page.getByText(/27 CFR 4\.32; 27 CFR 4\.33/)).toBeVisible();
  await expect(page.getByText(/27 CFR 4\.36/)).toBeVisible();
  await expect(page.getByText(/snapshot 2026-07-10/).first()).toBeVisible();

  // Net contents was filled in, and is still not a requirement.
  await expect(page.getByText(/holds no cited requirement/i).first()).toBeVisible();
  await expect(
    page.getByText(/not a statement that the field is not required/i).first(),
  ).toBeVisible();

  // No verdict language, anywhere.
  await expect(page.getByText(/\b(Approved|Cleared|Compliant|Certified)\b/)).toHaveCount(0);
});

test("a category with no profile gets no borrowed authority", async ({ page }) => {
  await page.goto("/create");
  await page.getByLabel(/beverage type/i).selectOption("beer");
  await page.getByRole("button", { name: /what you told us/i }).click();
  await expect(page.getByText(/required by cited authority/i)).toHaveCount(0);
  await expect(page.getByText(/requirements profile for wine only/i).first()).toBeVisible();
});

test("the scaffold always carries its disclaimer", async ({ page }) => {
  await page.goto("/create");
  await page.getByRole("button", { name: /starter scaffold/i }).click();
  await expect(
    page.getByText(/starting point only\. this is not a compliant layout\./i),
  ).toBeVisible();
  await expect(
    page.getByText(/placement, size, contrast, and typography are not checked/i),
  ).toBeVisible();
  // Nothing implies a finished or checked layout. Matched without /i, the way
  // the rest of the suite does: the disclaimer must stay free to say this is
  // "not a compliant layout", which is the very claim we want it making.
  await expect(page.getByText(/\b(Approved|Cleared|Compliant|Certified)\b/)).toHaveCount(0);
  await expect(page.getByText(/looks good|ready to submit/i)).toHaveCount(0);
});

test("export produces a real, checksum-verifiable project file", async ({ page }) => {
  await page.goto("/create");
  await enterWineFacts(page);
  await page.getByRole("button", { name: /^export$/i }).click();
  await expect(page.getByText(/nothing is saved here/i)).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /export project file/i }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^label-lens-project-facts-label-lens-project-facts\.v1-[0-9a-f]{64}\.json$/,
  );

  const text = readFileSync(await download.path(), "utf8");
  const parsed = JSON.parse(text);

  // The maker's assertions survived, verbatim.
  expect(parsed.declaredFacts.brandName).toBe("Cardinal Ridge");
  expect(parsed.declaredFacts.netContents).toBe("750 mL");
  expect(parsed.declaredFacts.producerBottler).toBeNull();

  // The cited requirements came from the registry, and only those.
  expect(parsed.citedRequirements).toHaveLength(2);
  expect(parsed.citedRequirements.map((r: { fieldId: string }) => r.fieldId).sort()).toEqual([
    "alcoholStatement",
    "brandName",
  ]);

  // The checksum verifies with the committed canonical serialization.
  const { integrity, ...payload } = parsed;
  expect(integrity.algorithm).toBe("SHA-256");
  const digest = await page.evaluate(async (canonical) => {
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }, canonicalStringify(payload));
  expect(integrity.value).toBe(digest);

  // No evaluation, verdict, or approval leaked into the artifact.
  expect(text).not.toMatch(/\b(PASS|FAIL|APPROVED|COMPLIANT)\b/);
  expect(parsed.advisoryNotice.text).toMatch(/may still be required/i);
});
