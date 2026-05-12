import { defineConfig } from 'vitest/config'
import { packageRoot } from './vitest.shared'

export default defineConfig({
  root: packageRoot,
  test: {
    name: 'core-typecheck',
    include: [],
    coverage: {
      enabled: false,
    },
    typecheck: {
      checker: 'tsc',
      enabled: true,
      include: ['src/**/*.type.test.ts'],
      only: true,
      tsconfig: './tsconfig.typecheck.json',
    },
  },
})
