import { expect, test } from "./tauri.fixture";

test.describe("Client Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Client Dashboard
    await page.getByRole("button", { name: /Client \(Mobile\)/i }).click();
  });

  test("should display discovery view by default", async ({ page }) => {
    await expect(page.getByText("Connect to a Host")).toBeVisible();
    await expect(page.getByPlaceholder("IP Address")).toBeVisible();
  });

  test("should show empty state if disconnected", async ({ page }) => {
    await expect(page.getByText("Discover Hosts")).toBeVisible();
    await expect(
      page.getByText("Check if the ShelfSync Host is running on the same network."),
    ).toBeVisible();
  });

  test("should allow navigating back to role selection", async ({ page }) => {
    await page.getByRole("button", { name: /Change Role/i }).click();
    await expect(page.getByText("Choose Your Role")).toBeVisible();
  });
});
