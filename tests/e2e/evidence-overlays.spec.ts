import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Evidence-centered result: overlays drawn from server geometry must track the
 * rendered image across responsive widths, link bidirectionally with the
 * seller-review cards, and degrade honestly when no preview exists.
 */

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

async function runUpload(page: Page) {
  await page.goto("/review/legacy");
  await page.getByLabel(/select one label image/i).setInputFiles(FIXTURE);
  await page.getByLabel(/application brand name/i).fill("M CELLARS");
  await page.getByLabel(/application alcohol value/i).fill("12.5");
  await page.getByRole("button", { name: /^run pre-check$/i }).click();
  await expect(page.getByRole("heading", { name: /pre-check result/i })).toBeVisible({
    timeout: 150_000,
  });
}

/** Assert `inner` sits inside `outer` (1px tolerance for border rounding). */
async function expectWithin(inner: Locator, outer: Locator) {
  const ib = await inner.boundingBox();
  const ob = await outer.boundingBox();
  expect(ib).not.toBeNull();
  expect(ob).not.toBeNull();
  expect(ib!.x).toBeGreaterThanOrEqual(ob!.x - 1);
  expect(ib!.y).toBeGreaterThanOrEqual(ob!.y - 1);
  expect(ib!.x + ib!.width).toBeLessThanOrEqual(ob!.x + ob!.width + 1);
  expect(ib!.y + ib!.height).toBeLessThanOrEqual(ob!.y + ob!.height + 1);
}

test("upload result draws evidence overlays inside the rendered image at desktop and mobile widths", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await runUpload(page);

  const resultImage = page.getByAltText(/confirmation review image/i);
  const alcoholOverlay = page.getByRole("button", {
    name: /alcohol machine evidence region/i,
  });
  const brandOverlay = page.getByRole("button", { name: /brand machine evidence region/i });

  await expect(alcoholOverlay).toBeVisible();
  await expect(brandOverlay).toBeVisible();
  await expectWithin(alcoholOverlay, resultImage);
  await expectWithin(brandOverlay, resultImage);

  await page.setViewportSize({ width: 375, height: 812 });
  await expectWithin(alcoholOverlay, resultImage);
  await expectWithin(brandOverlay, resultImage);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("seller finding cards and machine regions are linked in both directions", async ({ page }) => {
  test.setTimeout(180_000);
  await runUpload(page);

  const alcoholCard = page.getByRole("button", { name: /alcohol statement.*machine:/i });
  await alcoholCard.click();

  const alcoholOverlay = page.getByRole("button", {
    name: /alcohol machine evidence region/i,
  });
  await expect(alcoholOverlay).toHaveAttribute("data-active", "true");

  await alcoholOverlay.click();
  await expect(alcoholCard).toHaveAttribute("data-active", "true");
});

test("overlays remain present in dark mode", async ({ page }) => {
  test.setTimeout(180_000);
  await runUpload(page);
  await page.getByRole("button", { name: /display settings/i }).click();
  await page.getByRole("radio", { name: /^dark$/i }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: /alcohol machine evidence region/i }),
  ).toBeVisible();
});

test("sample run shows an honest no-preview state instead of overlays", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/review/legacy");
  await page.getByRole("button", { name: /load verified m cellars sample/i }).click();
  await expect(page.getByRole("heading", { name: /pre-check result/i })).toBeVisible({
    timeout: 150_000,
  });

  await expect(page.getByText(/no image review is available for this run/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /machine evidence region/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /review what the machine found/i })).toBeVisible();
  await expect(page.getByText(/drawing or revising a human review region/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /save seller decision/i })).toBeVisible();
});
