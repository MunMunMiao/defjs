import { defineConfig } from 'vitest/config'
import { globalSetupPath, packageRoot } from './vitest.shared'

export default defineConfig({
  root: packageRoot,
  test: {
    name: 'core-deno-compat',
    include: ['test-runtime/**/*.deno.spec.ts'],
    globalSetup: globalSetupPath,
    coverage: {
      enabled: false,
    },
  },
})
