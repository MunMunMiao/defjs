import { defineConfig } from 'vitest/config'
import { coverageConfig } from './test/shared'

export default defineConfig({
  test: {
    coverage: {
      ...coverageConfig,
    },
    projects: ['./vitest.config.node.ts'],
  },
})
