import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

// Committed export hashing logic, imported directly so the browser test verifies
// the downloaded checksum with the same code the server used to produce it.
import { payloadHash } from "../../src/pipeline/export/json/canonical-json";

const REGISTRY_ORDER = [
  "wine-alcohol-syntax",
  "brand-name-canonical-comparison",
  "wine-alcohol-declared-comparison",
  "wine-alcohol-actual-content-tolerance",
  "wine-alcohol-class-type-boundary",
  "wine-alcohol-omission-eligibility",
];

const FIXTURE = "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg";

/**
 * Expand a progressive-disclosure section by its summary text. Idempotent: it
 * sets `open` directly so calling it on an already-open section is harmless.
 */
async function openSection(page: Page, title: string) {
  await page.evaluate((t) => {
    const summaries = Array.from(document.querySelectorAll("details > summary"));
    const summary = summaries.find((el) => el.textContent?.includes(t));
    if (summary) (summary.parentElement as HTMLDetailsElement).open = true;
  }, title);
}

test("home page shows the advisory pre-check with run disabled until inputs exist", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /label lens ttb/i })).toBeVisible();
  await expect(page.getByText(/not a TTB approval/i).first()).toBeVisible();
  await expect(page.getByText(/prescreen a wine label before formal review/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^run pre-check$/i })).toBeDisabled();
});

test("bundled M Cellars sample runs the real pipeline end-to-end and downloads a verifiable export", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/");

  // 2 · Advisory and privacy notices are visible.
  await expect(page.getByText(/not a TTB approval/i).first()).toBeVisible();
  await expect(page.getByText(/does not store it/i)).toBeVisible();

  // 3 · Load the explicitly labeled bundled demonstration fixture.
  await expect(page.getByText(/bundled demonstration fixture/i)).toBeVisible();
  await page.getByRole("button", { name: /load verified m cellars sample/i }).click();

  // 4 · Declared sample values are populated.
  await expect(page.getByLabel(/application brand name/i)).toHaveValue("M CELLARS");
  await expect(page.getByLabel(/application alcohol value/i)).toHaveValue("12.5");

  // 5 + 6 · Real server-side check runs and completion is announced.
  const result = page.getByRole("heading", { name: /pre-check result/i });
  await expect(result).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText(/pre-check complete/i)).toBeVisible();

  // 7 · The concise summary presents the brand reading in plain language. The
  // brand mark is not cleanly recoverable, so it reads as "Multiple possibilities".
  await expect(page.getByText(/detected brand/i)).toBeVisible();
  await expect(page.getByText(/Multiple possibilities/i).first()).toBeVisible();
  await expect(page.getByText(/12\.5% ALC\.\/VOL\./).first()).toBeVisible();

  // 8 · Independent evidence assessments live under Technical provenance.
  await openSection(page, "Technical provenance");
  await expect(page.getByText(/brand-name-check/).first()).toBeVisible();
  await expect(page.getByText(/wine-alcohol-check/).first()).toBeVisible();

  // 9 · Expand Regulatory checks; all six findings appear in registry order.
  await openSection(page, "Regulatory checks");
  const findingOrder = await page.locator("ol li .font-medium").allInnerTexts();
  const seen = REGISTRY_ORDER.map((id) => findingOrder.indexOf(id));
  expect(seen).toEqual([...seen].sort((a, b) => a - b));
  for (const id of REGISTRY_ORDER) expect(findingOrder).toContain(id);

  // 10 · Authority information is visible.
  await expect(page.getByText(/27 CFR/).first()).toBeVisible();

  // 11 · Not-run checks are grouped under one shared explanation, with each
  // specific dependency preserved (no per-rule repetition).
  await expect(page.getByText(/cannot be established from label artwork alone/i)).toBeVisible();
  await expect(page.getByText(/actual alcohol content with provenance/).first()).toBeVisible();
  await expect(page.getByText(/class\/type or taxable-boundary evidence/).first()).toBeVisible();
  await expect(page.getByText(/table\/light-wine designation evidence/).first()).toBeVisible();

  // No overall status / compliance score is presented.
  await expect(page.getByText(/\b(Approved|Compliant|Noncompliant|Official result)\b/)).toHaveCount(
    0,
  );

  // 12 + 13 · Download the JSON export (Downloads is open by default) and read it.
  const filenameShown = (await page.locator("code").first().innerText()).trim();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /download json export/i }).click(),
  ]);
  const path = await download.path();
  const downloadedText = readFileSync(path, "utf8");

  // 14 · Parse and verify the export checksum using committed export logic.
  const parsed = JSON.parse(downloadedText);
  const { integrity, ...payload } = parsed;
  expect(integrity.algorithm).toBe("SHA-256");
  expect(payloadHash(payload)).toBe(integrity.value);

  // 15 · Confirm the deterministic suggested filename.
  expect(download.suggestedFilename()).toMatch(
    /^label-lens-wine-precheck-precheck-result\.v1-[0-9a-f]{64}\.json$/,
  );
  expect(download.suggestedFilename()).toBe(filenameShown);
});

test("operator can record a disposition and download an updated report from the real result", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.getByRole("button", { name: /load verified m cellars sample/i }).click();
  await expect(page.getByRole("heading", { name: /pre-check result/i })).toBeVisible({
    timeout: 150_000,
  });

  // Machine findings before disposition (must remain unchanged after append).
  await openSection(page, "Regulatory checks");
  const findingIdsBefore = await page.locator("ol li .font-medium").allInnerTexts();
  expect(findingIdsBefore).toContain("wine-alcohol-syntax");

  // 2 · Expand and record one bounded operator disposition.
  await openSection(page, "Record internal disposition");
  await page.getByLabel(/operator identifier/i).fill("reviewer-e2e");
  await page.getByLabel(/decision/i).selectOption("escalated_for_human_review");
  await page.getByLabel(/reason code/i).fill("NEEDS_SECOND_LOOK");
  await page.getByRole("button", { name: /record disposition/i }).click();

  // 3 · History entry appears.
  await expect(page.getByText(/Sequence 1:/i)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/reviewer-e2e/)).toBeVisible();

  // 4 · Findings remain unchanged.
  await openSection(page, "Regulatory checks");
  const findingIdsAfter = await page.locator("ol li .font-medium").allInnerTexts();
  expect(findingIdsAfter).toEqual(
    expect.arrayContaining(["wine-alcohol-syntax", "brand-name-canonical-comparison"]),
  );

  // 5 · Download updated JSON and verify the checksum includes the disposition.
  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /download json export/i }).click(),
  ]);
  const jsonText = readFileSync(await jsonDownload.path(), "utf8");
  const parsed = JSON.parse(jsonText);
  const { integrity, ...payload } = parsed;
  expect(payloadHash(payload)).toBe(integrity.value);
  expect(parsed.humanDispositionHistory).toHaveLength(1);
  expect(parsed.humanDispositionHistory[0].decision).toBe("escalated_for_human_review");

  // 6 · Download the readable report.
  const [reportDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /download readable report/i }).click(),
  ]);
  expect(reportDownload.suggestedFilename()).toMatch(
    /^label-lens-wine-precheck-precheck-result\.v1-[0-9a-f]{64}\.html$/,
  );
  const reportHtml = readFileSync(await reportDownload.path(), "utf8");

  // 7 · Inspect the report text (server-produced; unchanged by this UI PR).
  expect(reportHtml).toMatch(/not a TTB approval/i);
  expect(reportHtml).toMatch(/M CELLARS/);
  expect(reportHtml).toMatch(/12\.5% ALC\.\/VOL\./);
  for (const id of REGISTRY_ORDER) expect(reportHtml).toContain(id);
  const positions = REGISTRY_ORDER.map((id) => reportHtml.indexOf(id));
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  expect(reportHtml).toMatch(/escalated_for_human_review/);
  expect(reportHtml).toMatch(/reviewer-e2e/);
  expect(reportHtml).toMatch(/External evidence required/);

  // 8 · No overall approval/rejection language.
  expect(reportHtml).not.toMatch(/\b(Approved|Rejected|Compliant|Noncompliant)\b/);
});

test("upload rerun with alcohol 13 flips only the declared-comparison outcome", async ({
  page,
}) => {
  test.setTimeout(180_000);

  async function runUpload(alcohol: string) {
    await page.goto("/");
    await page.getByLabel(/select one label image/i).setInputFiles(FIXTURE);
    await page.getByLabel(/application brand name/i).fill("M CELLARS");
    await page.getByLabel(/application alcohol value/i).fill(alcohol);
    await page.getByRole("button", { name: /^run pre-check$/i }).click();
    await expect(page.getByRole("heading", { name: /pre-check result/i })).toBeVisible({
      timeout: 150_000,
    });
    await openSection(page, "Regulatory checks");
    // Map each finding rule id to its status token.
    const statuses: Record<string, string> = {};
    const items = page.locator("ol li");
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      const id = (await items.nth(i).locator(".font-medium").innerText()).trim();
      const status = (await items.nth(i).locator(".font-mono").first().innerText()).trim();
      statuses[id] = status;
    }
    return statuses;
  }

  const at125 = await runUpload("12.5");
  const at13 = await runUpload("13");

  // Executed deterministic checks: only the declared comparison changes.
  expect(at13["brand-name-canonical-comparison"]).toBe(at125["brand-name-canonical-comparison"]);
  expect(at13["wine-alcohol-syntax"]).toBe(at125["wine-alcohol-syntax"]);
  expect(at125["wine-alcohol-declared-comparison"]).toBe("PASS");
  expect(at13["wine-alcohol-declared-comparison"]).toBe("FAIL");
});
