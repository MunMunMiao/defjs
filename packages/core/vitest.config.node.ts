import { defineConfig } from 'vitest/config'
import { coverageConfig, globalSetupPath, packageRoot, runtimeSpecificSpecPatterns } from './vitest.shared'

export default defineConfig({
  root: packageRoot,
  test: {
    name: 'core-node',
    include: ['src/**/*.spec.ts'],
    exclude: runtimeSpecificSpecPatterns.filter(pattern => pattern !== 'src/**/*.node.spec.ts'),
    globalSetup: globalSetupPath,
    coverage: {
      ...coverageConfig,
    },
    pool: 'threads',
  },
})
