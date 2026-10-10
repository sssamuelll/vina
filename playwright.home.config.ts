import { defineConfig, devices } from '@playwright/test';

// La home se prueba contra el BUILD (vite preview): el peso y el cero-JS solo
// son ciertos después de bundlear. Puerto propio y strictPort: nunca reutilizar
// un servidor ajeno (ya pasó con 5174 en esta máquina).
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /home\.spec\.ts/,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4179', ...devices['Desktop Chrome'] },
  webServer: {
    // VINA_E2E_BUILD=1: el gate del deploy ya compiló y aquí solo se sirve; sin
    // ella, compila él. Antes el deploy compilaba dos veces.
    command: process.env.VINA_E2E_BUILD
      ? 'npx vite preview --port 4179 --strictPort'
      : 'npm run build && npx vite preview --port 4179 --strictPort',
    port: 4179,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
