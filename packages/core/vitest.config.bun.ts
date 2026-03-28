import { defineConfig } from 'vitest/config'
import { globalSetupPath, packageRoot } from './vitest.shared'

export default defineConfig({
  root: packageRoot,
  test: {
    name: 'core-bun-compat',
    include: ['test-runtime/**/*.bun.spec.ts'],
    globalSetup: globalSetupPath,
    coverage: {
      enabled: false,
    },
  },
})
