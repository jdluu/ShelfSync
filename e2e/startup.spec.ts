import { chromium, expect, test } from "@playwright/test";

test("app should launch and display the OPDS catalog", async () => {
  // Connect to the generic CDP endpoint provided by the Tauri app.
  // 'localhost:1422' must match the port the app is launched with
  // (see test:e2e:dev in package.json).
  const browser = await chromium.connectOverCDP("http://localhost:1422");

  const context = browser.contexts()[0];
  const page = context.pages()[0];

  await page.waitForLoadState("domcontentloaded");

  await expect(page.getByText("ShelfSync")).toBeVisible();

  await browser.close();
});
