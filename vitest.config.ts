import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration.
 *
 * Flat single-project config. The former `default` / `seamly-heavy` project
 * split existed solely to isolate two CDT-heavy Seamly2D tests
 * (tshirtMeshing/cubicBezier, #631) in their own forked process; both died
 * with the Seamly removal (2026-06-05), so the split — and the duplicated
 * test runs it caused — went with them.
 */
export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'tests/**/*.test.ts',
      'server/**/*.test.ts',
      'eslint-rules/tests/**/*.test.js',
    ],
    exclude: ['node_modules/**'],
    setupFiles: ['tests/setup/locale.ts'],
    // La máquina es de varias sesiones y de otras aplicaciones, y la suite no se la
    // lleva entera. Por defecto vitest usa todas las CPU menos una: 23 workers en
    // 24 CPU lógicas. El 10-10, con `cusickGate.cpu` (105 s) y tres `.maria` (~29 s)
    // ocupando núcleos a la vez, los tests chicos que leen archivos se volvieron
    // diez veces más lentos (`idiomaDeOpciones`: 0,5 s solo, 5,4 s en la suite) y se
    // pasaron de los 5 s por defecto: dos ensayos de la #1241 murieron en este
    // paso, sin llegar al build. Un tercio de las CPU, y 30 s por test y por hook:
    // un test se mide por lo que comprueba, no por cuánto tarda con la máquina
    // cargada, y 30 s sigue cazando uno colgado. `VITEST_MAX_WORKERS` lo pisa.
    maxWorkers: Math.max(4, Math.floor(availableParallelism() / 3)),
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        'dist-server/**',
        '**/*.test.ts',
        '**/__tests__/**',
        '**/types.ts',
        '**/*.d.ts',
        'server/**',
        'tests/**',
      ],
      // Current coverage: 71% statements, 62% branches, 68% functions, 73% lines
      // Thresholds set slightly below current to prevent regression
      thresholds: {
        statements: 60,
        branches: 55,
        functions: 60,
        lines: 60,
      },
    },
  },
});
