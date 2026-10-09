import { defineConfig, devices } from '@playwright/test';

// El puerto de los e2e se escoge con VINA_E2E_PORT (5174 por defecto). Con
// `reuseExistingServer`, Playwright se queda con el primer servidor que
// responda en su puerto: dos árboles de trabajo con el mismo puerto validan uno
// el Vite del otro, en silencio. `--strictPort`: un puerto ocupado falla en vez
// de mudarse a otro donde nadie lo espera.
const PUERTO = Number(process.env.VINA_E2E_PORT ?? 5174);

export default defineConfig({
  testDir: './tests/e2e',
  // Los specs @gpu-local (DoD #897, perf) requieren GPU/WebGPU real — corren
  // SOLO bajo playwright.webgpu.config.ts (npm run test:e2e:gpu). Aquí (config
  // por defecto, SwiftShader/CI) se excluyen: sin WebGPU fallan por timeout.
  grepInvert: /@gpu-local/,
  // La home (tests/e2e/home.spec.ts) se prueba contra el build: playwright.home.config.ts.
  testIgnore: /home\.spec\.ts/,
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
    baseURL: `http://localhost:${PUERTO}`,
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
    command: `npx vite --port ${PUERTO} --strictPort`,
    port: PUERTO,
    reuseExistingServer: true,
    timeout: 15000,
  },
});
