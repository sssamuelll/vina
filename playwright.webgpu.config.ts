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
  grepInvert: undefined, // anula la exclusión heredada del config base
  workers: 1,
  // Perf debe fallar ruidosamente: un retry re-mide bajo instrumentación de trace.
  retries: 0,
  use: {
    ...base.use,
    headless: false,
    launchOptions: {
      args: [
        '--enable-unsafe-webgpu',
        // Evita el throttling de rAF cuando la ventana headed queda ocluida.
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        // marcas de tiempo de la GPU sin redondear a 0,1 ms, para el perfil de la tela (tela-implicita.spec.ts)
        ...(process.env.VINA_WEBGPU_PERFIL ? ['--enable-webgpu-developer-features'] : []),
      ],
    },
  },
});
