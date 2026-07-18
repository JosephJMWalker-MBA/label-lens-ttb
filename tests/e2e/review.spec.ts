import { readFileSync } from "node:fs";

import { expect, test, type Locator, type Page } from "@playwright/test";

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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("label-lens.onboarding.seen.v1", "true");
    } catch {
      /* storage unavailable */
    }
  });
});

function disclosure(page: Page, title: string): Locator {
  return page.locator("details", {
    has: page.locator("summary", { hasText: title }),
  });
}

async function openSection(page: Page, title: string): Promise<Locator> {
  const section = disclosure(page, title);
  await expect(section).toHaveCount(1);
  await section.evaluate((node: HTMLDetailsElement) => {
    node.open = true;
  });
  return section;
}

async function loadSample(page: Page) {
  await page.goto("/review");
  await page.getByRole("button", { name: /load verified m cellars sample/i }).click();
  await expect(page.getByRole("heading", { name: /pre-check result/i })).toBeVisible({
    timeout: 150_000,
  });
}

async function runUpload(page: Page, alcohol: string) {
  await page.goto("/review");
  await page.getByLabel(/select one label image/i).setInputFiles(FIXTURE);
  await page.getByLabel(/application brand name/i).fill("M CELLARS");
  await page.getByLabel(/application alcohol value/i).fill(alcohol);
  await page.getByRole("button", { name: /^run pre-check$/i }).click();
  await expect(page.getByRole("heading", { name: /pre-check result/i })).toBeVisible({
    timeout: 150_000,
  });
}

const structuredDownloadButton = (page: Page) =>
  page.getByRole("button", { name: /download structured pre-check record/i });
const readableDownloadButton = (page: Page) =>
  page.getByRole("button", { name: /download human-readable pre-check report/i });

test("review page shows the advisory pre-check with run disabled until inputs exist", async ({
  page,
}) => {
  await page.goto("/review");
  await expect(page.getByRole("heading", { level: 1, name: /label lens ttb/i })).toBeVisible();
  await expect(page.getByText(/not a TTB approval/i).first()).toBeVisible();
  await expect(page.getByText(/prescreen a wine label before formal review/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^run pre-check$/i })).toBeDisabled();
});

test("bundled M Cellars sample runs the real pipeline end-to-end and downloads a verifiable export", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/review");

  await expect(page.getByText(/not a TTB approval/i).first()).toBeVisible();
  await expect(page.getByText(/does not store it/i)).toBeVisible();
  await expect(page.getByText(/bundled demonstration fixture/i)).toBeVisible();

  await page.getByRole("button", { name: /load verified m cellars sample/i }).click();
  await expect(page.getByLabel(/application brand name/i)).toHaveValue("M CELLARS");
  await expect(page.getByLabel(/application alcohol value/i)).toHaveValue("12.5");
  await expect(page.getByRole("heading", { name: /pre-check result/i })).toBeVisible({
    timeout: 150_000,
  });
  await expect(page.getByText(/pre-check complete/i)).toBeVisible();

  await expect(page.getByRole("heading", { name: /review what the machine found/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /brand name.*machine:/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /alcohol statement.*machine:/i })).toBeVisible();
  await expect(page.getByText(/12\.5% ALC\.\/VOL\./).first()).toBeVisible();

  const provenance = await openSection(page, "Technical provenance");
  await expect(provenance.getByText(/brand-name-check/).first()).toBeVisible();
  await expect(provenance.getByText(/wine-alcohol-check/).first()).toBeVisible();

  const checks = await openSection(page, "Regulatory checks");
  const findingOrder = await checks.locator("ol > li > div .font-medium").allInnerTexts();
  const seen = REGISTRY_ORDER.map((id) => findingOrder.indexOf(id));
  expect(seen).toEqual([...seen].sort((a, b) => a - b));
  for (const id of REGISTRY_ORDER) expect(findingOrder).toContain(id);

  await expect(checks.getByText(/27 CFR/).first()).toBeVisible();
  await expect(checks.getByText(/cannot be established from label artwork alone/i)).toBeVisible();
  await expect(checks.getByText(/actual alcohol content with provenance/).first()).toBeVisible();
  await expect(checks.getByText(/class\/type or taxable-boundary evidence/).first()).toBeVisible();
  await expect(checks.getByText(/table\/light-wine designation evidence/).first()).toBeVisible();
  await expect(page.getByText(/\b(Approved|Compliant|Noncompliant|Official result)\b/)).toHaveCount(
    0,
  );

  const downloads = await openSection(page, "Downloads");
  const filenameShown = (await downloads.locator("code").first().innerText()).trim();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    structuredDownloadButton(page).click(),
  ]);
  const downloadedText = readFileSync(await download.path(), "utf8");
  const parsed = JSON.parse(downloadedText);
  const { integrity, ...payload } = parsed;
  expect(integrity.algorithm).toBe("SHA-256");
  expect(payloadHash(payload)).toBe(integrity.value);
  expect(download.suggestedFilename()).toMatch(
    /^label-lens-wine-precheck-precheck-result\.v1-[0-9a-f]{64}\.json$/,
  );
  expect(download.suggestedFilename()).toBe(filenameShown);
});

test("operator can record a disposition and download an updated report from the real result", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await loadSample(page);

  const checks = await openSection(page, "Regulatory checks");
  const findingIdsBefore = await checks.locator("ol > li > div .font-medium").allInnerTexts();
  expect(findingIdsBefore).toContain("wine-alcohol-syntax");

  await openSection(page, "Record internal disposition");
  await page.getByLabel(/operator identifier/i).fill("reviewer-e2e");
  await page.getByLabel(/decision/i).selectOption("escalated_for_human_review");
  await page.getByLabel(/reason code/i).fill("NEEDS_SECOND_LOOK");
  await page.getByRole("button", { name: /record disposition/i }).click();
  await expect(page.getByText(/Sequence 1:/i)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/reviewer-e2e/)).toBeVisible();

  const findingIdsAfter = await checks.locator("ol > li > div .font-medium").allInnerTexts();
  expect(findingIdsAfter).toEqual(
    expect.arrayContaining(["wine-alcohol-syntax", "brand-name-canonical-comparison"]),
  );

  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    structuredDownloadButton(page).click(),
  ]);
  const jsonText = readFileSync(await jsonDownload.path(), "utf8");
  const parsed = JSON.parse(jsonText);
  const { integrity, ...payload } = parsed;
  expect(payloadHash(payload)).toBe(integrity.value);
  expect(parsed.humanDispositionHistory).toHaveLength(1);
  expect(parsed.humanDispositionHistory[0].decision).toBe("escalated_for_human_review");

  const [reportDownload] = await Promise.all([
    page.waitForEvent("download"),
    readableDownloadButton(page).click(),
  ]);
  expect(reportDownload.suggestedFilename()).toMatch(
    /^label-lens-wine-precheck-precheck-result\.v1-[0-9a-f]{64}\.html$/,
  );
  const reportHtml = readFileSync(await reportDownload.path(), "utf8");
  expect(reportHtml).toMatch(/not a TTB approval/i);
  expect(reportHtml).toMatch(/M CELLARS/);
  expect(reportHtml).toMatch(/12\.5% ALC\.\/VOL\./);
  for (const id of REGISTRY_ORDER) expect(reportHtml).toContain(id);
  const positions = REGISTRY_ORDER.map((id) => reportHtml.indexOf(id));
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  expect(reportHtml).toMatch(/escalated_for_human_review/);
  expect(reportHtml).toMatch(/reviewer-e2e/);
  expect(reportHtml).toMatch(/External evidence required/);
  expect(reportHtml).not.toMatch(/\b(Approved|Rejected|Compliant|Noncompliant)\b/);
});

test("upload rerun with alcohol 13 flips only the declared-comparison outcome", async ({
  page,
}) => {
  test.setTimeout(180_000);

  async function statusesFor(alcohol: string) {
    await runUpload(page, alcohol);
    const checks = await openSection(page, "Regulatory checks");
    const statuses: Record<string, string> = {};
    const items = checks.locator("ol > li");
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      const id = (await item.locator(".font-medium").first().innerText()).trim();
      const status = (await item.locator(".font-mono").first().innerText()).trim();
      statuses[id] = status;
    }
    return statuses;
  }

  const at125 = await statusesFor("12.5");
  const at13 = await statusesFor("13");
  expect(at13["brand-name-canonical-comparison"]).toBe(at125["brand-name-canonical-comparison"]);
  expect(at13["wine-alcohol-syntax"]).toBe(at125["wine-alcohol-syntax"]);
  expect(at125["wine-alcohol-declared-comparison"]).toBe("PASS");
  expect(at13["wine-alcohol-declared-comparison"]).toBe("FAIL");
});

test("downloads produce real browser files: JSON, HTML, a repeat, and a disposition-updated report", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await loadSample(page);
  await openSection(page, "Downloads");

  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    structuredDownloadButton(page).click(),
  ]);
  expect(jsonDownload.suggestedFilename()).toMatch(
    /^label-lens-wine-precheck-precheck-result\.v1-[0-9a-f]{64}\.json$/,
  );
  const jsonText = readFileSync(await jsonDownload.path(), "utf8");
  const parsed = JSON.parse(jsonText);
  const { integrity, ...payload } = parsed;
  expect(integrity.algorithm).toBe("SHA-256");
  expect(payloadHash(payload)).toBe(integrity.value);
  expect(parsed.exportType).toBe("wine-precheck-result");
  expect(jsonText).not.toMatch(/\/Users\/|\/home\/|\/var\/folders\//);

  const [htmlDownload] = await Promise.all([
    page.waitForEvent("download"),
    readableDownloadButton(page).click(),
  ]);
  expect(htmlDownload.suggestedFilename()).toMatch(
    /^label-lens-wine-precheck-precheck-result\.v1-[0-9a-f]{64}\.html$/,
  );
  const htmlText = readFileSync(await htmlDownload.path(), "utf8");
  expect(htmlText).toMatch(/^<!doctype html>/i);
  expect(htmlText).toMatch(/<\/html>\s*$/i);
  expect(htmlText).toMatch(/M CELLARS/);
  for (const id of REGISTRY_ORDER) expect(htmlText).toContain(id);

  const [jsonAgain] = await Promise.all([
    page.waitForEvent("download"),
    structuredDownloadButton(page).click(),
  ]);
  expect(readFileSync(await jsonAgain.path(), "utf8")).toBe(jsonText);

  await openSection(page, "Record internal disposition");
  await page.getByLabel(/operator identifier/i).fill("reviewer-dl");
  await page.getByLabel(/decision/i).selectOption("escalated_for_human_review");
  await page.getByLabel(/reason code/i).fill("NEEDS_SECOND_LOOK");
  await page.getByRole("button", { name: /record disposition/i }).click();
  await expect(page.getByText(/Sequence 1:/i)).toBeVisible({ timeout: 60_000 });

  const [jsonWithDisposition] = await Promise.all([
    page.waitForEvent("download"),
    structuredDownloadButton(page).click(),
  ]);
  const updated = JSON.parse(readFileSync(await jsonWithDisposition.path(), "utf8"));
  expect(updated.humanDispositionHistory).toHaveLength(1);
  expect(updated.humanDispositionHistory[0].decision).toBe("escalated_for_human_review");

  const [htmlWithDisposition] = await Promise.all([
    page.waitForEvent("download"),
    readableDownloadButton(page).click(),
  ]);
  const updatedHtml = readFileSync(await htmlWithDisposition.path(), "utf8");
  expect(updatedHtml).toMatch(/escalated_for_human_review/);
  expect(updatedHtml).toMatch(/reviewer-dl/);
});
