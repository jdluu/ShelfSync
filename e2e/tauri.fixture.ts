import { test as base, chromium, type Page } from "@playwright/test";

export const test = base.extend<{
  page: Page;
  newTauriPage: () => Promise<Page>;
}>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires object destructuring
  page: async ({}, use) => {
    const browser = await chromium.connectOverCDP("http://localhost:1422");
    const context = browser.contexts()[0];
    const page = context.pages()[0];

    await page.addInitScript(() => {
      (window as unknown as { __TEST_RESET__: boolean }).__TEST_RESET__ = true;
    });
    await page.reload();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForLoadState("domcontentloaded");

    await use(page);
  },
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires object destructuring
  newTauriPage: async ({}, use) => {
    const browser = await chromium.connectOverCDP("http://localhost:1422");
    const context = browser.contexts()[0];

    await use(async () => {
      // In Tauri, "new pages" are usually new windows.
      // We can trigger a new window via Tauri API or just return another page if one exists.
      // For testing multi-instance UI, we can use context.pages() or similar.
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto("http://localhost:1420"); // Vite dev server URL
      await page.waitForLoadState("domcontentloaded");
      return page;
    });
  },
});

export { expect } from "@playwright/test";
