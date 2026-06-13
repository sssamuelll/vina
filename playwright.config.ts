import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Los specs @gpu-local (DoD #897, perf) requieren GPU/WebGPU real — corren
  // SOLO bajo playwright.webgpu.config.ts (npm run test:e2e:gpu). Aquí (config
  // por defecto, SwiftShader/CI) se excluyen: sin WebGPU fallan por timeout.
  grepInvert: /@gpu-local/,
  // CI runners (SwiftShader software GL, 2 workers) run 3-6× slower than a dev
  // machine — basic interactions (goto, mouse.move) blow a 30s budget under
  // contention. Sim-heavy specs already set test.setTimeout(120s) themselves.
  timeout: process.env.CI ? 120_000 : 30_000,
  expect: {
    timeout: process.env.CI ? 15_000 : 5_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
  fullyParallel: true,
  // CI runners (ubuntu-latest, 4 vCPU). Within each shard, 2 parallel workers
  // gives good speedup without OOM under ANGLE+SwiftShader WebGL.
  workers: process.env.CI ? 2 : undefined,
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    // WebGL needs actual GPU — use headed when available
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx vite --port 5174',
    port: 5174,
    reuseExistingServer: true,
    timeout: 15000,
  },
});
