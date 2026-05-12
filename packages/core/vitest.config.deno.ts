import { defineConfig } from 'vitest/config'
import { globalSetupPath, packageRoot, runtimeSpecificSpecPatterns } from './vitest.shared'

export default defineConfig({
  root: packageRoot,
  test: {
    name: 'core-deno',
    include: ['src/**/*.spec.ts'],
    exclude: runtimeSpecificSpecPatterns.filter(pattern => pattern !== 'src/**/*.deno.spec.ts'),
    globalSetup: globalSetupPath,
    coverage: {
      enabled: false,
    },
  },
})
