import { test, expect } from "@playwright/test";

test("landing page responds", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/./);
});
