import { defineConfig, devices } from '@playwright/test';

// The captures run against the build (vite preview): two surfaces exist only in
// DEV. Own port and strictPort: never reuse another server.
export default defineConfig({
  testDir: './tests/capturas',
  globalSetup: './tests/capturas/global-setup.ts',
  workers: 1,
  retries: 0,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  // Every test loads María's DXF.
  timeout: 180_000,
  use: { baseURL: 'http://localhost:4174', deviceScaleFactor: 1 },
  projects: [
    { name: 'maria-1366x768', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 } },
    { name: 'desk-1600x1000', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 } },
  ],
  webServer: {
    command: process.env.VINA_E2E_BUILD
      ? 'npx vite preview --port 4174 --strictPort'
      : 'npm run build && npx vite preview --port 4174 --strictPort',
    port: 4174,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
