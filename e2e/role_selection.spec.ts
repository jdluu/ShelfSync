import { expect, test } from "./tauri.fixture";

test.describe("Role Selection", () => {
  test("should display role selection cards", async ({ page }) => {
    await expect(page.getByText("Choose Your Role")).toBeVisible();
    await expect(page.getByRole("button", { name: /Host \(Desktop\)/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Client \(Mobile\)/i })).toBeVisible();
  });

  test("should navigate to Host Dashboard on host selection", async ({ page }) => {
    await page.getByRole("button", { name: /Host \(Desktop\)/i }).click();
    await expect(page.getByText("Host Dashboard")).toBeVisible();
  });

  test("should navigate to Client Dashboard on client selection", async ({ page }) => {
    // Reload or reset state if needed, but for now we check if we can go back/select
    await page.reload(); // Reset to home for next test if state persists
    await page.getByRole("button", { name: /Client \(Mobile\)/i }).click();
    await expect(page.getByText("Client Dashboard")).toBeVisible();
  });
});
