import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 60_000,
  expect: {
    timeout: 12_000,
  },
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command:
      "pnpm --dir apps/web dev --host 127.0.0.1 --port 4173 --strictPort --mode e2e",
    url: "http://127.0.0.1:4173",
    // Full local auth E2E must not reuse an arbitrary Vite server whose
    // browser Supabase configuration might point to another environment.
    reuseExistingServer: !process.env.CI && process.env.HERO_LOCAL_FULL_E2E !== "1",
    timeout: 120_000,
  },
  projects: [
    {
      name: "mobile-390x844",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "mobile-360x800",
      use: {
        browserName: "chromium",
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
