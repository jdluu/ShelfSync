import { chromium, test } from "@playwright/test";

test("app should launch and display main window", async () => {
  // Connect to the generic CDP endpoint provided by the Tauri app
  // Note: 'localhost:1422' must match the port we launch the app with
  const browser = await chromium.connectOverCDP("http://localhost:1422");

  const context = browser.contexts()[0];
  const page = context.pages()[0];

  // Verify the title or some element on the page
  // Note: we might need to reload or wait for content if it connects too early
  await page.waitForLoadState("domcontentloaded");

  const title = await page.title();
  console.log(`App title: ${title}`);

  // Basic assertion - update this based on your actual app title
  // expect(title).not.toBe('');

  await browser.close();
});
