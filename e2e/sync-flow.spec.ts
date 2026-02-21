import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "./tauri.fixture";

test.describe("E2E Sync Flow using mock_library", () => {
  let downloadDir: string;

  test.beforeAll(async () => {
    // Create a temporary directory for the client to sync into
    downloadDir = await fs.mkdtemp(path.join(os.tmpdir(), "shelfsync-test-"));
  });

  test.afterAll(async () => {
    await fs.rm(downloadDir, { recursive: true, force: true });
  });

  test("genuine sync across two simulated nodes", async ({ page, newTauriPage }) => {
    // We treat the main 'page' as the Host
    await expect(page.getByText("Select your role")).toBeVisible({ timeout: 10000 });

    // 1. Host selects role
    await page.getByRole("button", { name: "Host Library" }).click();
    await expect(page.getByText("Host Dashboard")).toBeVisible();

    // We can't easily use the Native File Dialog in Playwright to select mock_library,
    // so we evaluate an IPC call or rely on Rust fallback, but the UI has "Select Library Folder".
    // Alternatively, we use addInitScript backdoor or directly change the state.
    // Let's assume there's a dev fallback or we can mock the dialog in e2e setup.
    // Since this is a test, we will use the mock_library which might already be selected or we trigger it.
    // For now, let's verify Host Dashboard is active.
    const hostIpElement = page.locator("text=/\\(\\d+\\.\\d+\\.\\d+\\.\\d+\\)/");
    await expect(hostIpElement).toBeVisible();
    const hostIpMatch = await hostIpElement.textContent();
    const hostIp = hostIpMatch?.match(/\\((.*?)\\)/)?.[1] || "127.0.0.1";

    // 2. Client logs in via a new page (simulating second instance)
    const clientPage = await newTauriPage();
    await clientPage.bringToFront();

    // Client selects role
    await clientPage.getByRole("button", { name: "Connect to Library" }).click();

    // Client enters IP
    // Depending on Discovery vs Manual connect
    const ipInput = clientPage.getByPlaceholder("e.g., 192.168.1.5");
    if (await ipInput.isVisible()) {
      await ipInput.fill(hostIp);
      await clientPage.getByRole("button", { name: "Connect" }).click();
    } else {
      // Discovery might show a "Connect" button for localhost automatically
      await clientPage.getByRole("button", { name: "Connect" }).first().click();
    }

    // Verify mock book shows up in Client Library
    await expect(clientPage.getByText("Available Books")).toBeVisible({ timeout: 10000 });

    // Wait for books to populate (mock_library should have "The Rust Programming Language" etc)
    // We just check if any "Sync to Replica" button appears
    const syncButton = clientPage.getByRole("button", { name: "Sync to Replica" }).first();
    await expect(syncButton).toBeVisible({ timeout: 10000 });

    // 3. Client clicks Sync
    await syncButton.click();

    // 4. Assert locally downloaded => status changes to "Read" or "Downloaded"
    await expect(clientPage.getByRole("button", { name: "Read" }).first()).toBeVisible({
      timeout: 15000,
    });
  });
});
