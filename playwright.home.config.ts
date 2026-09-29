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
    command: 'npm run build && npx vite preview --port 4179 --strictPort',
    port: 4179,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
