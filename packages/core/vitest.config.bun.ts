import { defineConfig } from 'vitest/config'
import { globalSetupPath, packageRoot, runtimeSpecificSpecPatterns } from './vitest.shared'

export default defineConfig({
  root: packageRoot,
  test: {
    name: 'core-bun',
    include: ['src/**/*.spec.ts'],
    exclude: runtimeSpecificSpecPatterns.filter(pattern => pattern !== 'src/**/*.bun.spec.ts'),
    globalSetup: globalSetupPath,
    coverage: {
      enabled: false,
    },
  },
})
