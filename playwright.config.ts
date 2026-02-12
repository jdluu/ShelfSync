import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  workers: 1, // Run sequentially for local app testing
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "tauri",
      use: {
        // We don't use a browser, we connect to an existing CDP session
      },
    },
  ],
});
