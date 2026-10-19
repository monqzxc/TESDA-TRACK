import { defineConfig, devices } from '@playwright/test'

// E2E_PORT lets two test runs work side by side, each with its own dev server.
const PORT = Number(process.env.E2E_PORT ?? 5173)

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // One dev server compiles every module on its first request, for all the workers. Past two, workers mostly
  // queue behind it: the suite runs slower and its waits time out.
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
})
