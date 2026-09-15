import { coverageConfigDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  define: { __CLI_VERSION__: JSON.stringify('0.0.0-test') },
  test: {
    exclude: ['build', 'node_modules'],
    coverage: {
      include: ['source/**/*.ts'],
      exclude: ['build', ...coverageConfigDefaults.exclude],
      provider: 'v8',
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80
      }
    },
    testTimeout: 30000
  }
})
