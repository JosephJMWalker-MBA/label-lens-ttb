import { expect, test, type Page, type Route } from "@playwright/test";

const FIXTURE = "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg";

test.use({ deviceScaleFactor: 2 });

function packageDraftFromMultipart(route: Route) {
  const body = route.request().postDataBuffer()?.toString("utf8") ?? "";
  const marker = 'name="packageDraft"\r\n\r\n';
  const start = body.indexOf(marker);
  if (start < 0) throw new Error("packageDraft multipart field missing");
  const valueStart = start + marker.length;
  const end = body.indexOf("\r\n--", valueStart);
  if (end < 0) throw new Error("packageDraft multipart boundary missing");
  return JSON.parse(body.slice(valueStart, end));
}

async function mockPackageAnalysis(page: Page) {
  await page.route("**/api/package/analyze", async (route) => {
    const draft = packageDraftFromMultipart(route);
    const front = draft.panels.find((panel: { role: string }) => panel.role === "front");
    const back = draft.panels.find((panel: { role: string }) => panel.role === "back");
    const brand = draft.categories.find(
      (category: { categoryId: string }) => category.categoryId === "brandName",
    );
    const alcohol = draft.categories.find(
      (category: { categoryId: string }) => category.categoryId === "alcoholStatement",
    );
    const notObserved = {
      state: "NOT_OBSERVED",
      value: null,
      confidence: 0,
      ocrEvidenceScore: 0,
      alternates: [],
    };
    const observedBrand = {
      state: "OBSERVED",
      value: "M CELLARS",
      normalizedValue: "M CELLARS",
      confidence: 0.95,
      ocrEvidenceScore: 0.95,
      alternates: [],
      geometry: {
        imageIndex: 0,
        x: front.width * 0.2,
        y: front.height * 0.2,
        width: front.width * 0.2,
        height: front.height * 0.1,
        imageWidth: front.width,
        imageHeight: front.height,
      },
    };
    const observedAlcohol = {
      state: "OBSERVED",
      value: "12.5% ALC./VOL.",
      normalizedValue: "12.5",
      confidence: 0.95,
      ocrEvidenceScore: 0.95,
      alternates: [],
      geometry: {
        imageIndex: 0,
        x: back.width * 0.2,
        y: back.height * 0.2,
        width: back.width * 0.2,
        height: back.height * 0.1,
        imageWidth: back.width,
        imageHeight: back.height,
      },
    };
    const provenance = {
      artifactRef: "e2e-package-panel",
      derivativeSha256: "a".repeat(64),
      extractionAdapterId: "e2e",
      extractionAdapterVersion: "1",
      ocrEngine: { kind: "not_applicable" },
      parserId: "e2e",
      parserVersion: "1",
      processedAt: "2026-07-18T00:00:00.000Z",
    };
    const panelRuns = draft.panels.map((panel: { panelId: string; role: string }) => ({
      panelId: panel.panelId,
      machineResultId: `machine-${draft.analysisRuns.length + 1}-${panel.panelId}`,
      exportJson: JSON.stringify({
        versionManifest: {
          applicationBuild: {
            packageVersion: "0.1.0",
            gitCommitSha: "e575ca664b6ea897b0d7a25235dc87da428b69dd",
            commitProvenance: "build-environment",
          },
        },
      }),
      observations: {
        provenance,
        brandName: panel.role === "front" ? observedBrand : notObserved,
        alcoholStatement: panel.role === "back" ? observedAlcohol : notObserved,
      },
    }));
    const brandClear = brand.expectedValue === "M CELLARS" && brand.regions.length > 0;
    const alcoholClear = alcohol.expectedValue === "12.5" && alcohol.regions.length > 0;
    const categories = [
      {
        categoryId: "brandName",
        state: brandClear ? "clearly_readable" : "needs_review",
        observedValue: "M CELLARS",
        supportingPanelIds: brandClear ? [front.panelId] : [],
        supportingRegionIds: brandClear
          ? brand.regions.map((region: { regionId: string }) => region.regionId)
          : [],
        reason: brandClear
          ? "Machine and seller evidence agree."
          : "Seller and machine values differ.",
      },
      {
        categoryId: "alcoholStatement",
        state: alcoholClear ? "clearly_readable" : "needs_review",
        observedValue: "12.5% ALC./VOL.",
        supportingPanelIds: alcoholClear ? [back.panelId] : [],
        supportingRegionIds: alcoholClear
          ? alcohol.regions.map((region: { regionId: string }) => region.regionId)
          : [],
        reason: alcoholClear
          ? "Machine and seller evidence agree."
          : "Seller and machine values differ.",
      },
    ];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          analysisRun: {
            analysisRunId: `analysis-${draft.analysisRuns.length + 1}`,
            sequence: draft.analysisRuns.length + 1,
            sellerChangeSequence: draft.sellerChangeHistory.length,
            recordedAt: "2026-07-18T00:00:00.000Z",
            panelRuns,
            categories,
            readiness:
              brandClear && alcoholClear ? "ready_for_agent_submission" : "needs_seller_review",
          },
        },
      }),
    });
  });
}

async function dragRegion(page: Page) {
  const canvas = page.getByRole("img", { name: /label annotation image/i });
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const existingRegionCount = await page.locator("g[data-region-id]").count();
  await page.getByRole("button", { name: /draw region/i }).click();
  await canvas.hover({ position: { x: box!.width * 0.12, y: box!.height * 0.12 } });
  await page.mouse.down();
  await canvas.hover({
    position: { x: box!.width * 0.72, y: box!.height * 0.62 },
    force: true,
  });
  await expect(page.locator("g[data-region-id]")).toHaveCount(existingRegionCount + 1);
  await page.mouse.up();
}

test("seller prepares, saves, analyzes, exports, reloads, and reanalyzes a front/back package", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await mockPackageAnalysis(page);
  await page.goto("/review");
  await expect(
    page.getByRole("heading", { name: /upload the seller label package/i }),
  ).toBeVisible();

  await page.getByLabel(/front panel image/i).setInputFiles(FIXTURE);
  await page.getByLabel(/back panel image/i).setInputFiles(FIXTURE);
  await page.getByRole("button", { name: /^front panel$/i }).click();
  await page.getByLabel(/seller-provided value/i).fill("M CELLARS");

  await page.getByRole("button", { name: /zoom in/i }).click();
  await page.getByRole("button", { name: /pan right/i }).click();
  await page.getByRole("button", { name: /reset view/i }).click();
  await page.getByRole("button", { name: /rotate clockwise/i }).click();
  await page.getByRole("button", { name: /reset view/i }).click();
  await dragRegion(page);
  await expect(page.getByText(/1 across 1 panel/)).toBeVisible();

  await page.getByRole("button", { name: /alcohol statement.*preparation incomplete/i }).click();
  await page.getByRole("button", { name: /^back panel$/i }).click();
  await page.getByLabel(/seller-provided value/i).fill("12.5");
  await dragRegion(page);

  await page.getByLabel(/^left %$/i).fill("10");
  await page.getByLabel(/^top %$/i).fill("10");
  await page.getByLabel(/^width %$/i).fill("75");
  await page.getByLabel(/^height %$/i).fill("70");
  await page.getByRole("button", { name: /apply coordinates/i }).click();
  await dragRegion(page);
  await expect(page.getByText(/2 across 1 panel/)).toBeVisible();

  const southeastHandle = page.locator('rect[aria-label$="from se"]');
  const handleBox = await southeastHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handleBox!.x + handleBox!.width / 2 + 10,
    handleBox!.y + handleBox!.height / 2 + 6,
  );
  await page.mouse.up();

  await page.getByRole("button", { name: "Move selected", exact: true }).click();
  const selected = page.locator('g[data-active="true"]');
  const selectedBox = await selected.boundingBox();
  expect(selectedBox).not.toBeNull();
  await page.mouse.move(
    selectedBox!.x + selectedBox!.width / 2,
    selectedBox!.y + selectedBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    selectedBox!.x + selectedBox!.width / 2 + 12,
    selectedBox!.y + selectedBox!.height / 2 + 8,
  );
  await page.mouse.up();
  await page.getByRole("button", { name: /remove selected/i }).click();
  await expect(page.getByText(/1 across 1 panel/)).toBeVisible();

  await page.getByRole("button", { name: /save draft locally/i }).click();
  await expect(page.getByText(/Draft: saved/)).toBeVisible();
  await page.getByRole("button", { name: /analyze saved package/i }).click();
  await expect(page.getByText(/Analysis runs: 1/)).toBeVisible();
  await expect(page.getByText(/Ready for local agent-package export/).first()).toBeVisible();

  await page.getByLabel(/seller or submitter name/i).fill("Seller E2E");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /submit to agent.*download locally/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/seller-agent-package\.json$/);
  await expect(page.getByText(/nothing was sent to an agent or to TTB/i)).toBeVisible();

  await page.getByRole("button", { name: /copy machine region as seller region/i }).click();
  await expect(page.getByText(/Reanalysis required after seller changes/).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /submit to agent.*download locally/i }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /save draft locally/i }).click();
  await page.getByRole("button", { name: /analyze saved package/i }).click();
  await expect(page.getByText(/Analysis runs: 2/)).toBeVisible();

  await page.reload();
  await expect(page.getByText(/Analysis runs: 2/)).toBeVisible();
  await page.getByRole("button", { name: /brand name.*clearly readable/i }).click();
  await page.getByLabel(/seller-provided value/i).fill("WRONG BRAND");
  await page.getByRole("button", { name: /save draft locally/i }).click();
  await page.getByRole("button", { name: /analyze saved package/i }).click();
  await expect(page.getByText(/Analysis runs: 3/)).toBeVisible();
  await expect(page.getByText(/Seller review required/).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /submit to agent.*download locally/i }),
  ).toBeDisabled();

  const storedRuns = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("label-lens-seller-package-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return await new Promise<Array<{ analysisRunId: string; panelRuns: unknown[] }>>(
      (resolve, reject) => {
        const request = database.transaction("drafts").objectStore("drafts").get("current-package");
        request.onsuccess = () => resolve(request.result.draft.analysisRuns);
        request.onerror = () => reject(request.error);
      },
    );
  });
  expect(storedRuns.map((run) => run.analysisRunId)).toEqual([
    "analysis-1",
    "analysis-2",
    "analysis-3",
  ]);
  expect(storedRuns[0].panelRuns).toHaveLength(2);
});

test("package workspace stacks without horizontal overflow at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/review");
  await expect(
    page.getByRole("heading", { name: /prepare a seller label package/i }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByText(/nothing is submitted to TTB/i)).toBeVisible();
});
