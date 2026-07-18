import { expect, test } from "@playwright/test";

/**
 * The intent-first front door (#96, from the #93 strategy). These drive a real
 * browser: a visitor who has no label can arrive, see what the product is for,
 * be told plainly what it cannot do, and reach the two paths that work.
 */

test("the hub asks what you want to do and offers the upload-or-build promise", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: /what would you like to do today\?/i }),
  ).toBeVisible();
  await expect(
    page.getByText(/upload your label — or, if you do not have one yet, build it here\./i),
  ).toBeVisible();
  // The advisory boundary is present on the front door.
  await expect(page.getByText(/not a TTB approval/i)).toBeVisible();
});

test("all five intents appear, and create, review and learn are active", async ({ page }) => {
  await page.goto("/");

  for (const title of [
    "Create a new label",
    "Improve an existing draft",
    "Review a label before submission",
    "Learn labeling requirements",
    "Find professional help",
  ]) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }

  // The intent list offers exactly three destinations.
  const intentLinks = page.getByRole("list").first().getByRole("link");
  await expect(intentLinks).toHaveCount(3);

  // Unavailable paths state their absence in text and expose nothing to click.
  await expect(page.getByText(/not available yet/i)).toHaveCount(2);
  await expect(page.getByRole("list").first().getByRole("button")).toHaveCount(0);

  // No marketing substitutes for the missing capability.
  await expect(page.getByText(/coming soon|waitlist|early access/i)).toHaveCount(0);
});

test("both active intents navigate, and the package review workflow loads", async ({ page }) => {
  await page.addInitScript(() =>
    window.localStorage.setItem("label-lens.onboarding.seen.v1", "true"),
  );

  await page.goto("/");
  await page.getByRole("link", { name: /review a label/i }).click();
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByLabel(/front panel image/i)).toBeVisible();
  await expect(page.getByLabel(/back panel image/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /analyze saved package/i })).toBeDisabled();

  await page.goto("/");
  await page.getByRole("link", { name: /see what is checked/i }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(page.getByRole("heading", { level: 1, name: /what is checked/i })).toBeVisible();
});

test("the requirements explorer shows real rules, their sources, and the limits", async ({
  page,
}) => {
  await page.goto("/learn");

  // Rule identity and the source it cites come from the committed registry.
  await expect(page.getByText("brand-name-canonical-comparison")).toBeVisible();
  await expect(page.getByText("wine-alcohol-declared-comparison")).toBeVisible();
  await expect(page.getByText(/27 CFR/).first()).toBeVisible();
  await expect(page.getByText(/snapshot \d{4}-\d{2}-\d{2}/).first()).toBeVisible();

  // Checks that cannot run from artwork are named honestly, with the evidence
  // each one actually requires.
  await expect(
    page.getByRole("heading", { name: /could not be evaluated from artwork alone/i }),
  ).toBeVisible();
  await expect(page.getByText(/actual alcohol content with provenance/i)).toBeVisible();
  await expect(page.getByText(/table\/light-wine designation evidence/i)).toBeVisible();
  await expect(page.getByText(/class\/type or taxable-boundary evidence/i)).toBeVisible();

  // No aggregate verdict anywhere.
  await expect(
    page.getByText(/\b(Approved|Cleared|Compliant|Noncompliant|Certified)\b/),
  ).toHaveCount(0);
});

test("the hub is keyboard navigable and the mark is not a certification badge", async ({
  page,
}) => {
  await page.goto("/");

  // The skip link is the first stop, then the header, then the intents.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: /skip to main content/i })).toBeFocused();

  // Every intent destination is reachable by keyboard alone.
  const reachable: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const href = await page.evaluate(() => document.activeElement?.getAttribute("href") ?? "");
    if (href) reachable.push(href);
  }
  expect(reachable).toContain("/review");
  expect(reachable).toContain("/learn");

  // The product mark is decorative; the header link carries the accessible name.
  await expect(page.getByRole("link", { name: /label lens — go to the start/i })).toBeVisible();
});

test("the hub renders in dark mode with the intents intact", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "label-lens.preferences.v1",
      JSON.stringify({ theme: "dark", fontScale: "default", motion: "system" }),
    );
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("heading", { level: 1, name: /what would you like to do today\?/i }),
  ).toBeVisible();
  await expect(page.getByText(/not available yet/i)).toHaveCount(2);
});
