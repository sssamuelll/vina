import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * WebGPU/GPU real: headed, SIN los args SwiftShader del config base.
 * Local-only (CI no tiene GPU). Lo usan el baseline de perf (F0) y los
 * replays @gpu-local (F4) — mismos flags ⇒ números conmensurables (#897).
 */
export default defineConfig({
  ...base,
  grep: /@gpu-local/,
  workers: 1,
  use: {
    ...base.use,
    headless: false,
    launchOptions: { args: ['--enable-unsafe-webgpu'] },
  },
});
