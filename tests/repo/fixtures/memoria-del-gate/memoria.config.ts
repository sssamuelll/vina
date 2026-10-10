import { defineConfig } from '@playwright/test';

// Fixture de tests/repo/la-memoria-del-gate.test.ts. Specs sin navegador (no
// piden `page`) para medir qué marcas deja scripts/memoria-del-gate.mjs con las
// reglas de verdad de Playwright: reintentos, grupos seriales y saltos.
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.pw\.ts/,
  retries: 1,
  workers: 1,
  outputDir: process.env.PW_SALIDA,
});
