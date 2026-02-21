import { expect, test } from "./tauri.fixture";

test.describe("Help Sidebar", () => {
  test("should open and close help sidebar", async ({ page }) => {
    // Open from any page (Home)
    await page.getByRole("button", { name: /Help/i }).click();
    await expect(page.getByText("ShelfSync Help")).toBeVisible();
    await expect(page.getByText("Getting Started")).toBeVisible();

    // Close via backdrop or X
    await page.getByLabel("Close sidebar").click();
    await expect(page.locator("aside")).toHaveClass(/translate-x-full/);
  });

  test("should navigate through help articles", async ({ page }) => {
    await page.getByRole("button", { name: /Help/i }).click();

    // Click a topic
    await page.getByRole("button", { name: /How to select a library\?/i }).click();
    await expect(page.getByText("Help Article")).toBeVisible();
    await expect(page.getByText("To start sharing your books")).toBeVisible();

    // Go back
    await page.getByRole("button", { name: /Back to Topics/i }).click();
    await expect(page.getByText("Setting up your first host")).toBeVisible();
  });

  test("should show mobile responsiveness in help sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE size
    await page.getByRole("button", { name: /Help/i }).click();

    const sidebar = page.locator("aside");
    const box = await sidebar.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(350); // Should be roughly full-width on mobile
  });
});
