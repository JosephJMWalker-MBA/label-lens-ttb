import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Evidence-centered result: overlays drawn from server geometry must track the
 * rendered image across responsive widths, link bidirectionally with the
 * evidence cards, and degrade honestly when no preview exists (sample run).
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
  await page.goto("/");
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

  const resultImage = page.getByAltText(/preview of the selected label image/i).last();
  const alcoholOverlay = page.getByRole("button", { name: /alcohol evidence region/i });
  const brandOverlay = page.getByRole("button", { name: /brand evidence region/i });

  await expect(alcoholOverlay).toBeVisible();
  await expect(brandOverlay).toBeVisible();
  await expectWithin(alcoholOverlay, resultImage);
  await expectWithin(brandOverlay, resultImage);

  // Responsive: at a narrow viewport the layout stacks, the overlays keep
  // tracking the resized image, and nothing scrolls horizontally.
  await page.setViewportSize({ width: 375, height: 812 });
  await expectWithin(alcoholOverlay, resultImage);
  await expectWithin(brandOverlay, resultImage);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("evidence cards and image regions are linked in both directions", async ({ page }) => {
  test.setTimeout(180_000);
  await runUpload(page);

  // Card → image: the alcohol card's locate control highlights and focuses its
  // region. The card element carries both aria-labelledby and tabindex, which
  // distinguishes it from the enclosing Summary section.
  const alcoholCard = page
    .locator('[aria-labelledby][tabindex="-1"]', { hasText: "Detected alcohol" })
    .first();
  await alcoholCard
    .getByRole("button", { name: /view on label/i })
    .first()
    .click();
  const alcoholOverlay = page.getByRole("button", { name: /alcohol evidence region/i });
  await expect(alcoholOverlay).toHaveAttribute("data-active", "true");
  await expect(alcoholOverlay).toBeFocused();

  // Image → card: activating the region focuses the corresponding card.
  await alcoholOverlay.click();
  await expect(alcoholCard).toBeFocused();
});

test("overlays remain present in dark mode", async ({ page }) => {
  test.setTimeout(180_000);
  await runUpload(page);
  await page.getByRole("button", { name: /display settings/i }).click();
  await page.getByRole("radio", { name: /^dark$/i }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: /alcohol evidence region/i })).toBeVisible();
});

test("sample run shows an honest no-preview state instead of overlays", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.getByRole("button", { name: /load verified m cellars sample/i }).click();
  await expect(page.getByRole("heading", { name: /pre-check result/i })).toBeVisible({
    timeout: 150_000,
  });

  await expect(page.getByText(/no image preview for this run/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /evidence region/i })).toHaveCount(0);
  // Field confirmation is active even when the sample has no local preview.
  await expect(page.getByRole("heading", { name: /review and confirm fields/i })).toBeVisible();
  await expect(page.getByText(/no image review is available for this run/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /save confirmation/i })).toHaveCount(2);
});
