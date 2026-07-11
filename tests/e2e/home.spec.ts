import { expect, test } from "@playwright/test";

test("home page shows the advisory pre-check with run disabled until inputs exist", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: /wine label pre-check/i }),
  ).toBeVisible();
  // Advisory boundary is visible and no government-approval language is present.
  await expect(page.getByText(/not a TTB approval/i).first()).toBeVisible();
  // The upload run is disabled until an image and both application values exist.
  await expect(page.getByRole("button", { name: /^run pre-check$/i })).toBeDisabled();
});

test("bundled M Cellars sample runs through the real pipeline and renders bounded findings", async ({
  page,
}) => {
  // Real OCR runs server-side; allow generous time for the first cold run.
  test.setTimeout(180_000);
  await page.goto("/");

  await page.getByRole("button", { name: /load verified m cellars sample/i }).click();

  const result = page.getByRole("heading", { name: /pre-check result/i });
  await expect(result).toBeVisible({ timeout: 150_000 });

  // Independent evidence assessment section is shown.
  await expect(page.getByRole("heading", { name: /evidence sufficiency/i })).toBeVisible();

  // Ordered findings render, including the deterministic first rule.
  await expect(page.getByText(/wine-alcohol-syntax/).first()).toBeVisible();
  await expect(page.getByText(/brand-name-canonical-comparison/).first()).toBeVisible();

  // Advisory notice within the result and a JSON download control.
  await expect(page.getByRole("button", { name: /download json export/i })).toBeVisible();

  // No overall status / compliance score is presented.
  await expect(page.getByText(/\b(Approved|Compliant|Noncompliant|Official result)\b/)).toHaveCount(
    0,
  );
});
