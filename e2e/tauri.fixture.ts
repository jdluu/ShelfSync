import { test as base, chromium, type Page } from "@playwright/test";

export const test = base.extend<{
  page: Page;
  newTauriPage: () => Promise<Page>;
}>({
  page: async (_, use) => {
    const browser = await chromium.connectOverCDP("http://localhost:1422");
    const context = browser.contexts()[0];
    const page = context.pages()[0];
    await page.waitForLoadState("domcontentloaded");
    await use(page);
  },
  newTauriPage: async (_, use) => {
    const browser = await chromium.connectOverCDP("http://localhost:1422");
    const context = browser.contexts()[0];

    await use(async () => {
      // In Tauri, "new pages" are usually new windows.
      // We can trigger a new window via Tauri API or just return another page if one exists.
      // For testing multi-instance UI, we can use context.pages() or similar.
      const page = await context.newPage();
      await page.goto("http://localhost:1420"); // Vite dev server URL
      await page.waitForLoadState("domcontentloaded");
      return page;
    });
  },
});

export { expect } from "@playwright/test";
