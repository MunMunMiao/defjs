import { defineConfig } from 'vitest/config'
import { globalSetupPath, packageRoot, runtimeSpecificSpecPatterns } from './test/shared'

export default defineConfig({
  root: packageRoot,
  test: {
    name: 'core-node',
    include: ['src/**/*.spec.ts'],
    exclude: [...runtimeSpecificSpecPatterns.filter((pattern) => pattern !== 'src/**/*.node.spec.ts'), 'src/handler/**/*.spec.ts'],
    globalSetup: globalSetupPath,
    pool: 'threads',
  },
})
