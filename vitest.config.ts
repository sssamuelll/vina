import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration.
 *
 * ## Pool isolation for CDT-heavy seamly2d tests (#631 fix)
 *
 * `tshirtMeshing.test.ts` and `cubicBezier.test.ts` are CPU-heavy: they run
 * Constrained Delaunay Triangulation over real Seamly2D patterns and parse
 * trousers.json from disk. Both pass deterministically in isolation but flake
 * intermittently when Vitest's default `threads` pool runs them concurrently
 * with the rest of the suite — the symptom is "flaky under concurrent run,
 * pass in isolation" (see `.github/workflows/ci.yml` exclude comment).
 *
 * Root cause: CPU contention. Worker threads share the process; under load
 * the CDT-bound tests miss their (already generous) timeouts intermittently.
 * Fix: split these two files into a dedicated `forks` project with
 * `singleFork: true`, so they run sequentially in their own OS process while
 * the rest of the suite stays on the default thread pool.
 *
 * Verification (local):
 *   for i in {1..20}; do npm run test -- src/utils/seamly2d/__tests__/tshirtMeshing.test.ts || echo "FAIL run $i"; done
 *   for i in {1..20}; do npm run test || echo "FAIL run $i"; done   # full suite under load
 * Expected: zero FAIL prints in either.
 *
 * If this fix is verified, the corresponding `--exclude` flags in
 * `.github/workflows/ci.yml` can be removed.
 */
export default defineConfig({
  test: {
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
    projects: [
      {
        extends: true,
        test: {
          name: 'default',
          include: [
            'src/**/*.test.ts',
            'src/**/*.test.tsx',
            'tests/**/*.test.ts',
            'eslint-rules/tests/**/*.test.js',
          ],
          exclude: [
            'node_modules/**',
            // Routed to the `seamly-heavy` project below — see file header.
            'src/utils/seamly2d/__tests__/tshirtMeshing.test.ts',
            'src/utils/seamly2d/__tests__/cubicBezier.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'seamly-heavy',
          include: [
            'src/utils/seamly2d/__tests__/tshirtMeshing.test.ts',
            'src/utils/seamly2d/__tests__/cubicBezier.test.ts',
          ],
          pool: 'forks',
          poolOptions: {
            forks: {
              singleFork: true,
            },
          },
        },
      },
    ],
  },
});
