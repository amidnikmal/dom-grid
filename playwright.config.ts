import { defineConfig } from '@playwright/test'

const PORT = 5179

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Never adopt a stray server on this port: it may belong to another app,
    // and the suite would silently test the wrong page.
    reuseExistingServer: false,
  },
})
