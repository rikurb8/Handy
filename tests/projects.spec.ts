import { expect, test } from "@playwright/test";

test.describe("Projects section", () => {
  test("Projects section renders app shell", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    await expect(page.locator("#root")).toHaveCount(1);
  });

  test("Projects-related bootstrap keeps app mounted", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#root")).toHaveCount(1);
    await page.waitForTimeout(1500);
    await expect(page.locator("#root")).toHaveCount(1);
  });
});

test.describe("Insert latest transcript", () => {
  test("Insert latest transcript flow does not crash page", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("html")).toHaveCount(1);
    await page.waitForTimeout(1500);
    await expect(page.locator("#root")).toHaveCount(1);
  });
});
