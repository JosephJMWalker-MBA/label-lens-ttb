import { mkdir } from "node:fs/promises";

import { expect, test, type Page, type Route } from "@playwright/test";

const FIXTURE = "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg";
const SCREENSHOT_DIRECTORY = "docs/reviews/issue-140";

test.use({ deviceScaleFactor: 2 });

async function capture(
  page: Page,
  locator: ReturnType<Page["locator"]>,
  name: string,
  hideProgress = false,
) {
  if (process.env.ISSUE_140_SCREENSHOTS !== "1") return;
  await mkdir(SCREENSHOT_DIRECTORY, { recursive: true });
  const progress = page.getByTestId("package-progress-footer");
  const priorStyle = hideProgress ? await progress.getAttribute("style") : null;
  if (hideProgress) {
    await progress.evaluate((element) => {
      (element as HTMLElement).style.position = "static";
    });
  }
  try {
    await locator.screenshot({ path: `${SCREENSHOT_DIRECTORY}/${name}.png` });
  } finally {
    if (hideProgress) {
      await progress.evaluate((element, style) => {
        if (style === null) element.removeAttribute("style");
        else element.setAttribute("style", style);
      }, priorStyle);
    }
  }
}

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
    const alcoholPanel = back ?? front;
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
        x: alcoholPanel.width * 0.2,
        y: alcoholPanel.height * 0.2,
        width: alcoholPanel.width * 0.2,
        height: alcoholPanel.height * 0.1,
        imageWidth: alcoholPanel.width,
        imageHeight: alcoholPanel.height,
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
        alcoholStatement: panel.panelId === alcoholPanel.panelId ? observedAlcohol : notObserved,
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
        supportingPanelIds: alcoholClear ? [alcoholPanel.panelId] : [],
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

test("seller uses the cycling workstation, contextual Guide, gates, and immutable reruns", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await mockPackageAnalysis(page);
  await page.goto("/review");
  await expect(page.getByTestId("upload-workspace")).toBeVisible();
  await expect(page.getByTestId("package-progress-footer")).toBeVisible();
  await expect(page.getByTestId("cycling-workspace").getByTestId("save-workspace")).toHaveCount(0);
  await capture(page, page.getByTestId("seller-workstation"), "01-upload-decisions", true);

  await page.getByLabel(/upload front label/i).setInputFiles(FIXTURE);
  await page.getByRole("button", { name: /no back label/i }).click();
  await expect(page.getByText(/back-panel absence recovery-checkpointed/i)).toBeVisible();
  await capture(page, page.getByTestId("upload-workspace"), "02-no-back-decision", true);
  const absentDraft = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("label-lens-seller-package-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return await new Promise<{ panels: Array<{ role: string }>; panelDecisions: unknown }>(
      (resolve, reject) => {
        const request = database.transaction("drafts").objectStore("drafts").get("current-package");
        request.onsuccess = () => resolve(request.result.draft);
        request.onerror = () => reject(request.error);
      },
    );
  });
  expect(absentDraft.panels.map((panel) => panel.role)).toEqual(["front"]);
  expect(absentDraft.panelDecisions).toEqual({ back: "absent", additional: "unresolved" });

  await page.getByRole("button", { name: /upload back label/i }).click();
  await page.getByLabel(/back label image/i).setInputFiles(FIXTURE);
  await expect(page.locator("summary").filter({ hasText: "Uploaded:" })).toHaveCount(2);
  await page.getByRole("button", { name: /no additional panels/i }).click();
  await expect(page.getByRole("heading", { name: "Brand name" })).toBeVisible();
  await expect(page.getByTestId("annotation-workspace")).toBeVisible();
  await expect(page.locator('g[data-working="true"]')).toHaveCount(1);
  await capture(page, page.getByTestId("seller-workstation"), "03-annotation-workstation", true);
  await capture(page, page.getByTestId("annotation-workspace"), "04-blue-working-box", true);

  await page.getByLabel(/what the label says/i).fill("M CELLARS");
  await page.getByRole("button", { name: /zoom in/i }).click();
  await page.getByRole("button", { name: /pan right/i }).click();
  await expect(page.getByTestId("annotation-workspace")).toHaveAttribute("data-zoom", "1.25");
  await expect(page.getByTestId("annotation-workspace")).toHaveAttribute("data-pan-x", "-48");
  const workingId = await page.locator('g[data-working="true"]').getAttribute("data-region-id");
  await page.getByRole("button", { name: /open guide/i }).click();
  await expect(page.getByTestId("contextual-guide")).toBeVisible();
  await capture(page, page.getByTestId("seller-workstation"), "05-guide-during-annotation", true);
  await page
    .getByTestId("contextual-guide")
    .getByRole("button", { name: /close guide/i })
    .click();
  await expect(page.getByLabel(/what the label says/i)).toHaveValue("M CELLARS");
  await expect(page.getByTestId("annotation-workspace")).toHaveAttribute("data-zoom", "1.25");
  await expect(page.getByTestId("annotation-workspace")).toHaveAttribute("data-pan-x", "-48");
  await expect(page.locator(`g[data-region-id="${workingId}"]`)).toHaveAttribute(
    "data-working",
    "true",
  );
  await page.getByRole("button", { name: /reset view/i }).click();
  await page.getByRole("button", { name: /accept brand name/i }).click();
  await expect(page.getByRole("heading", { name: "Alcohol statement" })).toBeVisible();
  await capture(page, page.getByTestId("seller-workstation"), "06-one-category-complete", true);
  await capture(page, page.getByTestId("package-progress-footer"), "07-progress-footer");

  await page.getByRole("button", { name: /^back$/i }).click();
  await page.getByLabel(/what the label says/i).fill("12.5");
  await dragRegion(page);
  await page.getByText("Enter coordinates").click();
  await page.getByLabel(/^left %$/i).fill("10");
  await page.getByLabel(/^top %$/i).fill("10");
  await page.getByLabel(/^width %$/i).fill("75");
  await page.getByLabel(/^height %$/i).fill("70");
  await page.getByRole("button", { name: /apply coordinates/i }).click();

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
  await page.getByRole("button", { name: /accept alcohol statement/i }).click();
  await expect(page.getByTestId("save-workspace")).toBeVisible();
  await capture(page, page.getByTestId("seller-workstation"), "08-save-gate", true);

  await page.getByRole("button", { name: /save draft locally/i }).click();
  await expect(page.getByText(/Draft: saved/i)).toBeVisible();
  await page.getByRole("button", { name: /^run pre-check$/i }).click();
  await expect(page.getByTestId("prepare-workspace")).toBeVisible();
  await expect(page.getByLabel("Latest pre-check results")).toContainText("Clearly readable");
  await capture(page, page.getByTestId("seller-workstation"), "09-precheck-results", true);

  await page.getByLabel(/seller or submitter name/i).fill("Seller E2E");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /^prepare agent package$/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/seller-agent-package\.json$/);
  await expect(page.getByText(/nothing was sent to an agent or to TTB/i)).toBeVisible();

  await page.getByRole("button", { name: /review accepted evidence/i }).click();
  await page.getByRole("button", { name: /use machine box/i }).click();
  await page.getByRole("button", { name: /accept alcohol statement/i }).click();
  await expect(page.getByText(/Pre-check: stale/i)).toBeVisible();
  await expect(page.getByText(/Draft: unsaved/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^prepare agent package$/i })).toHaveCount(0);
  await page.getByRole("button", { name: /save draft locally/i }).click();
  await page.getByRole("button", { name: /run pre-check/i }).click();
  await expect(page.getByTestId("prepare-workspace")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("prepare-workspace")).toBeVisible();
  await page.getByRole("button", { name: /review accepted evidence/i }).click();
  await page
    .getByLabel("Category progress")
    .getByRole("button", { name: /brand name/i })
    .click();
  await page.getByLabel(/what the label says/i).fill("WRONG BRAND");
  await page.getByRole("button", { name: /accept brand name/i }).click();
  await page.getByRole("button", { name: /save draft locally/i }).click();
  await page.getByRole("button", { name: /run pre-check/i }).click();
  await expect(page.getByText(/Seller review required/i).first()).toBeVisible();
  await expect(
    page.getByLabel("Category progress").getByRole("button", { name: /brand name/i }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Category progress").getByRole("button", { name: /alcohol statement/i }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /next category/i }).click();
  await expect(page.getByRole("heading", { name: "Brand name" })).toBeVisible();

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

test("IndexedDB rejection leaves category acceptance visibly failed and unadvanced", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = originalPut.apply(this, args as Parameters<IDBObjectStore["put"]>);
      if ((window as unknown as { rejectPackageWrites?: boolean }).rejectPackageWrites) {
        queueMicrotask(() => this.transaction.abort());
      }
      return request;
    };
  });
  await page.goto("/review");
  await page.getByLabel(/upload front label/i).setInputFiles(FIXTURE);
  await page.getByRole("button", { name: /upload back label/i }).click();
  await page.getByLabel(/back label image/i).setInputFiles(FIXTURE);
  await expect(page.locator("summary").filter({ hasText: "Uploaded:" })).toHaveCount(2);
  await page.getByRole("button", { name: /no additional panels/i }).click();
  await expect(page.getByRole("heading", { name: "Brand name" })).toBeVisible();
  const historyBefore = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("label-lens-seller-package-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return await new Promise<number>((resolve, reject) => {
      const request = database.transaction("drafts").objectStore("drafts").get("current-package");
      request.onsuccess = () => resolve(request.result.draft.sellerChangeHistory.length);
      request.onerror = () => reject(request.error);
    });
  });

  await page.getByLabel(/what the label says/i).fill("M CELLARS");
  await page.evaluate(() => {
    (window as unknown as { rejectPackageWrites?: boolean }).rejectPackageWrites = true;
  });
  await page.getByRole("button", { name: /accept brand name/i }).click();
  await expect(page.getByText(/category was not accepted.*checkpoint failed/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Brand name" })).toBeVisible();
  await expect(page.getByText(/Categories: 0\/2/i)).toBeVisible();
  await expect(page.getByText(/Draft: error/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alcohol statement" })).toHaveCount(0);

  const historyAfter = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("label-lens-seller-package-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return await new Promise<number>((resolve, reject) => {
      const request = database.transaction("drafts").objectStore("drafts").get("current-package");
      request.onsuccess = () => resolve(request.result.draft.sellerChangeHistory.length);
      request.onerror = () => reject(request.error);
    });
  });
  expect(historyAfter).toBe(historyBefore);
});

test("390px workstation keeps task, Guide, canvas tools, next action, and progress accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/review");
  await page.getByLabel(/upload front label/i).setInputFiles(FIXTURE);
  await page.getByRole("button", { name: /upload back label/i }).click();
  await page.getByLabel(/back label image/i).setInputFiles(FIXTURE);
  await expect(page.locator("summary").filter({ hasText: "Uploaded:" })).toHaveCount(2);
  await page.getByRole("button", { name: /no additional panels/i }).click();
  await expect(page.getByTestId("annotation-workspace")).toBeVisible();
  await expect(page.getByRole("button", { name: /zoom in/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /draw region/i })).toBeVisible();
  await expect(page.getByText(/Next: Complete the next required category/i)).toBeVisible();
  await expect(page.getByTestId("package-progress-footer")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: /open guide/i }).click();
  await expect(page.getByTestId("contextual-guide")).toBeVisible();
  await page
    .getByTestId("contextual-guide")
    .getByRole("button", { name: /close guide/i })
    .click();
  await expect(page.getByTestId("annotation-workspace")).toBeVisible();
  await capture(page, page.locator("body"), "10-mobile-390");
  const finalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(finalOverflow).toBeLessThanOrEqual(1);
});
