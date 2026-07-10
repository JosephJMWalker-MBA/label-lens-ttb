import { expect, test } from "@playwright/test";

test("home page loads and shows the product heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /alcohol label verification/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /start a review/i })).toBeDisabled();
});
