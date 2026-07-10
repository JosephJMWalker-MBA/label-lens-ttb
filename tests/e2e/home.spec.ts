import { expect, test } from "@playwright/test";

test("home page loads the review workspace with analysis disabled until inputs exist", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /alcohol label verification/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /analyze label/i })).toBeDisabled();
});
