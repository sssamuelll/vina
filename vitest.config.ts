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
    environment: 'jsdom',
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'tests/**/*.test.ts',
      'eslint-rules/tests/**/*.test.js',
    ],
    exclude: ['node_modules/**'],
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
