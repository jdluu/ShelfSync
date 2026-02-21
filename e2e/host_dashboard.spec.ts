import { expect, test } from "./tauri.fixture";

test.describe("Host Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Host Dashboard
    await page.getByRole("button", { name: /Host \(Desktop\)/i }).click();
  });

  test("should display library selection and connectivity components", async ({ page }) => {
    await expect(page.getByText("Connectivity")).toBeVisible();
    await expect(page.getByRole("button", { name: /Select Library/i })).toBeVisible();
  });

  test("should show connection info when active", async ({ page }) => {
    // Note: We might need to mock the backend connection info if it's not live during tests
    // For now, check for the placeholders/status
    await expect(page.getByText(/Host IP/i)).toBeVisible();
    await expect(page.getByText(/Port/i)).toBeVisible();
  });

  test("should allow navigating back to role selection", async ({ page }) => {
    await page.getByRole("button", { name: /Change Role/i }).click();
    await expect(page.getByText("Choose Your Role")).toBeVisible();
  });
});
