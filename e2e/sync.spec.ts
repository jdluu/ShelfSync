import { expect, test } from "./tauri.fixture";

test.describe("Multi-Instance Sync", () => {
  test("should discover and sync from host to client", async ({ page, newTauriPage }) => {
    // Window 1: Host
    const hostPage = page;
    await hostPage.getByRole("button", { name: /Host \(Desktop\)/i }).click();

    // Mock the folder selection dialog to return a dummy path
    await hostPage.evaluate(() => {
      // @ts-expect-error
      window.__TAURI_INVOKE__ = async (cmd, args) => {
        if (cmd === "plugin:dialog|open") {
          return "C:/Mock/CalibreLibrary";
        }
        // Fallback or other mocks
        return null;
      };
    });

    await hostPage.getByRole("button", { name: /Select Library/i }).click();
    await expect(hostPage.getByText("C:/Mock/CalibreLibrary")).toBeVisible();
    await expect(hostPage.getByText("Connectivity")).toBeVisible();

    // Window 2: Client
    const clientPage = await newTauriPage();
    await clientPage.getByRole("button", { name: /Client \(Mobile\)/i }).click();

    // Wait for discovery to find the host (Window 1)
    // Discovery uses api.network.discoverHosts() which we might need to mock if it's too slow/real
    await expect(clientPage.getByText(/Connect to a Host/i)).toBeVisible();

    // Since discovery is real network-based, in a local test environment
    // it might not find "itself" easily or may fail due to firewall.
    // Let's mock the discovery results in the client page.
    await clientPage.evaluate(() => {
      // @ts-expect-error
      window.__TAURI_INVOKE__ = async (cmd, args) => {
        if (cmd === "plugin:network|discover_hosts") {
          return [{ ip: "127.0.0.1", port: 1422, hostname: "TestHost" }];
        }
        return null;
      };
    });

    // Refresh discovery
    await clientPage.getByRole("button", { name: /Search/i }).click();

    // Verify discovery card appears
    await expect(clientPage.getByText("TestHost")).toBeVisible();
    await clientPage.getByRole("button", { name: /Connect/i }).click();

    // Verify connection banner
    await expect(clientPage.getByText("Connected To")).toBeVisible();
    await expect(clientPage.getByText("Live Sync")).toBeVisible();

    // Trigger a sync (mocking the start_bulk_sync invoke if needed)
    // For now, check if the "Sync" button exists for a book
    // (We'd need books in the list, so we might need to mock get_host_manifest too)

    await clientPage.evaluate(() => {
      // @ts-expect-error
      const original = window.__TAURI_INVOKE__;
      // @ts-expect-error
      window.__TAURI_INVOKE__ = async (cmd, args) => {
        if (cmd === "plugin:network|get_host_manifest") {
          return [{ id: 1, title: "Test Book", authors: "Test Author", size: 1024 }];
        }
        if (cmd === "start_bulk_sync") {
          return { status: "started" };
        }
        // @ts-expect-error
        return original ? original(cmd, _args) : null;
      };
    });

    await clientPage.reload(); // Refresh to get mocked books
    await expect(clientPage.getByText("Test Book")).toBeVisible();

    // Start sync
    await clientPage
      .getByRole("button", { name: /Sync to Replica/i })
      .first()
      .click();

    // Check for progress overlay (which listens to "sync-progress" event)
    // We can emit the event from the host or just mock the progress state
    await expect(clientPage.getByText("Syncing")).toBeVisible();
  });
});
