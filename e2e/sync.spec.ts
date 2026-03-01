import { expect, test } from "./tauri.fixture";

test.describe("Multi-Instance Sync", () => {
  test("should discover and sync from host to client", async ({ page, newTauriPage }) => {
    // Window 1: Host
    const hostPage = page;
    await hostPage.getByRole("button", { name: /Host \(Desktop\)/i }).click();

    // Inject the mock library path so the React component bypasses the native dialog
    await hostPage.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: test backdoor
      (window as any).__TEST_MOCK_LIBRARY_PATH__ = "C:/CS Stuff/ShelfSync/mock_library";
    });

    await hostPage.getByRole("button", { name: /Select Library/i }).click();
    // After bypassing the native dialog and pulling from the mocked Calibre DB, we should see books.
    await expect(hostPage.getByText("Connectivity")).toBeVisible();
    await expect(hostPage.getByText("2 Books Found")).toBeVisible();
    const clientPage = await newTauriPage();
    await clientPage.getByRole("button", { name: /Client \(Mobile\)/i }).click();

    // Wait for discovery UI
    await expect(clientPage.getByText(/Connect to a Host/i)).toBeVisible();

    // Intercept the manifest API call with Playwright's page.route()
    // instead of injecting a global mock into production code.
    await clientPage.route("**/api/manifest", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 1,
            title: "The Great Gatsby",
            authors: "F. Scott Fitzgerald",
            series_index: 1,
            formats: ["epub"],
            tags: [],
            path: "mocked",
          },
        ]),
      });
    });

    // Fill in the Manual Connection form to bypass flaky UDP mDNS locally
    await clientPage.getByPlaceholder("IP Address").fill("127.0.0.1");
    // Port defaults to 8080 in the component so we don't need to change it
    // There are multiple Connect buttons (one per discovered host + the manual one).
    // The manual connection area has a "btn-success" Connect button.
    await clientPage
      .getByRole("button", { name: /^Connect$/i })
      .last()
      .click();

    // Verify connection banner
    await expect(clientPage.getByText("Connected To")).toBeVisible();
    await expect(clientPage.getByText("Live Sync").first()).toBeVisible();

    // Wait for the mocked manifest data to render
    await expect(clientPage.getByText("The Great Gatsby")).toBeVisible();

    // Verify we can see the sync button for the book
    const syncButton = clientPage.getByRole("button", { name: /Sync to Replica/i }).first();
    await expect(syncButton).toBeVisible();
    await syncButton.click();

    // Verify we are still connected after interaction
    await expect(clientPage.getByText("Live Sync").first()).toBeVisible();
  });
});
