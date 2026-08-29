import { defineConfig } from 'vitest/config'
import { globalSetupPath, packageRoot, runtimeSpecificSpecPatterns } from './test/shared.ts'

export default defineConfig({
  root: packageRoot,
  test: {
    name: 'core-server',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    exclude: runtimeSpecificSpecPatterns.filter((pattern) => pattern !== 'src/**/*.server.spec.ts'),
    globalSetup: globalSetupPath,
    pool: 'threads',
  },
})
