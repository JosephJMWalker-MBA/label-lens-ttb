import { mkdir } from "node:fs/promises";

import { expect, test, type Page, type Route } from "@playwright/test";

const LANDSCAPE_FIXTURE = "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg";
const PORTRAIT_FIXTURE = "tests/fixtures/precheck/approved-wine-001/label.png";
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
          : "Seller-confirmed text differs from the machine observation.",
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
          : "Seller-confirmed text differs from the machine observation.",
      },
    ];
    await new Promise((resolve) => setTimeout(resolve, 1_100));
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

async function expectSingleStageAction(page: Page, name: string | RegExp) {
  await expect(page.locator("[data-stage-completion-action]")).toHaveCount(1);
  await expect(
    page.getByTestId("package-progress-footer").getByRole("button", { name }),
  ).toBeVisible();
}

async function expectPanelContained(page: Page) {
  const viewport = await page.getByTestId("package-image-viewport").boundingBox();
  const image = await page.getByRole("img", { name: /label annotation image/i }).boundingBox();
  expect(viewport).not.toBeNull();
  expect(image).not.toBeNull();
  expect(image!.width).toBeLessThanOrEqual(viewport!.width - 24);
  expect(image!.height).toBeLessThanOrEqual(viewport!.height - 24);
}

async function readCurrentDraft(page: Page) {
  return await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("label-lens-seller-package-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return await new Promise<{
      sellerChangeHistory: Array<{ action: string }>;
      analysisRuns: Array<{ analysisRunId: string; panelRuns: unknown[] }>;
    }>((resolve, reject) => {
      const request = database.transaction("drafts").objectStore("drafts").get("current-package");
      request.onsuccess = () => resolve(request.result.draft);
      request.onerror = () => reject(request.error);
    });
  });
}

test("footer-driven workstation exits correction, fits panels, and preserves immutable reruns", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await mockPackageAnalysis(page);
  await page.goto("/review");
  await page.getByLabel(/upload front label/i).setInputFiles(PORTRAIT_FIXTURE);
  await page.getByRole("button", { name: /upload back label/i }).click();
  await page.getByLabel(/back label image/i).setInputFiles(LANDSCAPE_FIXTURE);
  await page.getByRole("button", { name: /no additional panels/i }).click();

  await expect(page.getByRole("heading", { name: "Brand name" })).toBeVisible();
  await expect(page.locator('g[data-working="true"]')).toHaveCount(0);
  await expect(
    page.getByLabel("Category progress").getByRole("button", { name: /brand name/i }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Draw region" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expectSingleStageAction(page, "Save Brand name");
  await expect(page.getByText(/draw one region around the brand name/i)).toBeVisible();
  await expectPanelContained(page);
  await capture(page, page.getByTestId("seller-workstation"), "11-clean-brand-start", true);
  await capture(page, page.getByTestId("annotation-workspace"), "19-fitted-portrait-label", true);

  await page.getByLabel(/what the label says/i).fill("M CELLARS");
  await dragRegion(page);
  await expect(page.locator('g[data-working="true"]')).toHaveCount(1);
  await expectSingleStageAction(page, "Save Brand name");
  await capture(page, page.getByTestId("annotation-workspace"), "12-draw-region-active", true);

  await page.getByRole("button", { name: /zoom in/i }).click();
  await page.getByTestId("annotation-workspace").focus();
  await page.getByTestId("annotation-workspace").press("ArrowRight");
  await expect(page.getByTestId("annotation-workspace")).toHaveAttribute("data-zoom", "1.25");
  await expect(page.getByTestId("annotation-workspace")).toHaveAttribute("data-pan-x", "-48");
  const workingId = await page.locator('g[data-working="true"]').getAttribute("data-region-id");
  await page.getByRole("button", { name: /open guide/i }).click();
  await page
    .getByTestId("contextual-guide")
    .getByRole("button", { name: /close guide/i })
    .click();
  await expect(page.getByTestId("annotation-workspace")).toHaveAttribute("data-zoom", "1.25");
  await expect(page.getByTestId("annotation-workspace")).toHaveAttribute("data-pan-x", "-48");
  await expect(page.locator(`g[data-region-id="${workingId}"]`)).toHaveAttribute(
    "data-working",
    "true",
  );
  await page.getByRole("button", { name: /reset view/i }).click();
  await expect(page.getByTestId("annotation-workspace")).toHaveAttribute("data-zoom", "1.00");

  await page.getByRole("button", { name: "Save Brand name" }).click();
  await expect(
    page.getByText(/Brand name saved.*package still has unsaved changes/i),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alcohol statement" })).toBeVisible();
  await page
    .getByLabel("Category progress")
    .getByRole("button", { name: /brand name/i })
    .click();
  await expect(page.locator('g[data-working="true"]')).toHaveCount(0);
  await expect(page.locator('g[data-working="false"]')).toHaveCount(1);
  await capture(page, page.getByTestId("seller-workstation"), "13-seller-box-saved", true);
  await page.getByRole("button", { name: "Continue with Alcohol statement" }).click();

  await expect(page.getByRole("button", { name: "Back" })).toHaveAttribute("aria-pressed", "true");
  await expectPanelContained(page);
  await capture(page, page.getByTestId("annotation-workspace"), "14-fitted-landscape-label", true);
  await page.getByLabel(/what the label says/i).fill("12.5");
  await dragRegion(page);
  await page.getByRole("button", { name: "Save Alcohol statement" }).click();

  await expect(page.getByTestId("save-workspace")).toBeVisible();
  await expectSingleStageAction(page, "Save draft locally");
  await page.getByRole("button", { name: "Save draft locally" }).click();
  await expectSingleStageAction(page, "Run pre-check");
  await page.getByRole("button", { name: "Run pre-check" }).click();
  await expectSingleStageAction(page, /Running pre-check/);
  await expect(page.getByText("00:00", { exact: true })).toBeVisible();
  await capture(page, page.getByTestId("package-progress-footer"), "18-precheck-timer");
  await expect(page.getByTestId("prepare-workspace")).toBeVisible();

  await page
    .getByLabel("Category progress")
    .getByRole("button", { name: /brand name/i })
    .click();
  await page.getByRole("button", { name: "Edit confirmed text" }).click();
  await page.getByLabel(/what the label says/i).fill("WRONG BRAND");
  await page.getByRole("button", { name: "Save Brand name" }).click();
  await expectSingleStageAction(page, "Save updated draft");
  await page.getByRole("button", { name: "Save updated draft" }).click();
  await page.getByRole("button", { name: "Run pre-check again" }).click();
  await expect(page.getByRole("heading", { name: "Brand name" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Return to current phase" })).toHaveCount(0);

  await expect(page.getByText("You confirmed")).toBeVisible();
  await expect(page.getByText("Machine detected")).toBeVisible();
  await expect(page.locator("[data-machine-observation]")).toHaveCount(0);
  await expectSingleStageAction(page, "Keep my evidence");
  await capture(
    page,
    page.getByTestId("seller-workstation"),
    "15-machine-observation-hidden",
    true,
  );
  await page.getByRole("button", { name: "Show machine observation" }).click();
  await expect(page.locator("[data-machine-observation]")).toHaveCount(1);
  await capture(page, page.getByTestId("seller-workstation"), "16-machine-observation-shown", true);

  await page.getByRole("button", { name: "Use machine region" }).click();
  await page.getByLabel(/what the label says/i).fill("M CELLARS");
  await page.getByRole("button", { name: "Save Brand name" }).click();
  await expect(
    page.getByRole("heading", { name: "All required evidence has been reviewed." }),
  ).toBeVisible();
  await expect(page.getByText("Save the updated draft to continue.")).toBeVisible();
  await expect(page.getByTestId("category-inspector")).toHaveCount(0);
  await expectSingleStageAction(page, "Save updated draft");
  await capture(
    page,
    page.getByTestId("seller-workstation"),
    "17-correction-complete-save-cta",
    true,
  );

  await page.getByRole("button", { name: "Save updated draft" }).click();
  await page.getByRole("button", { name: "Run pre-check again" }).click();
  await expectSingleStageAction(page, /Running pre-check/);
  await expect(page.getByTestId("prepare-workspace")).toBeVisible();

  await page.getByLabel(/seller or submitter name/i).fill("Seller E2E");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Prepare agent package" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/seller-agent-package\.json$/);
  await expect(page.getByText(/nothing was sent to an agent or to TTB/i)).toBeVisible();

  const storedDraft = await readCurrentDraft(page);
  expect(storedDraft.analysisRuns.map((run) => run.analysisRunId)).toEqual([
    "analysis-1",
    "analysis-2",
    "analysis-3",
  ]);
  expect(storedDraft.analysisRuns.every((run) => run.panelRuns.length === 2)).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("package-progress-footer")).toBeVisible();
  await capture(page, page.locator("body"), "20-mobile-footer-cta");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("IndexedDB rejection leaves category save visibly failed and unadvanced", async ({ page }) => {
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
  await page.getByLabel(/upload front label/i).setInputFiles(PORTRAIT_FIXTURE);
  await page.getByRole("button", { name: /upload back label/i }).click();
  await page.getByLabel(/back label image/i).setInputFiles(LANDSCAPE_FIXTURE);
  await page.getByRole("button", { name: /no additional panels/i }).click();
  await page.getByLabel(/what the label says/i).fill("M CELLARS");
  await dragRegion(page);
  const historyBefore = (await readCurrentDraft(page)).sellerChangeHistory.length;

  await page.evaluate(() => {
    (window as unknown as { rejectPackageWrites?: boolean }).rejectPackageWrites = true;
  });
  await page.getByRole("button", { name: "Save Brand name" }).click();
  await expect(
    page.getByText(/category was not saved because browser-local persistence failed/i),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Brand name" })).toBeVisible();
  await expect(page.getByText(/Categories: 0\/2/i)).toBeVisible();
  await expect(page.getByText(/Draft: error/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alcohol statement" })).toHaveCount(0);
  expect((await readCurrentDraft(page)).sellerChangeHistory.length).toBe(historyBefore);
});

test("390px clean start keeps the fitted label, Guide, and footer CTA accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/review");
  await page.getByLabel(/upload front label/i).setInputFiles(PORTRAIT_FIXTURE);
  await page.getByRole("button", { name: /no back label/i }).click();
  await page.getByRole("button", { name: /no additional panels/i }).click();
  await expect(page.getByTestId("annotation-workspace")).toBeVisible();
  await expect(page.getByRole("button", { name: "Draw region" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Fit label" })).toBeVisible();
  await expectSingleStageAction(page, "Save Brand name");
  await expectPanelContained(page);
  await page.getByRole("button", { name: /open guide/i }).click();
  await expect(page.getByTestId("contextual-guide")).toBeVisible();
  await page
    .getByTestId("contextual-guide")
    .getByRole("button", { name: /close guide/i })
    .click();
  await expect(page.getByTestId("annotation-workspace")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
