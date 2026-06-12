import { defineConfig } from 'vitest/config'
import { coverageConfig, globalSetupPath } from './test/shared'

export default defineConfig({
  test: {
    name: 'opentelemetry-server-node',
    globals: true,
    include: ['src/**/*.spec.ts', 'e2e.spec.ts'],
    globalSetup: globalSetupPath,
    coverage: {
      ...coverageConfig,
    },
  },
})
