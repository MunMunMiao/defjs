import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
export const globalSetupPath = resolve(packageRoot, 'test/setup.ts')
export const coverageConfig = {
  enabled: true,
  provider: 'istanbul' as const,
  reporter: ['lcov', 'json', 'html', 'text'],
  reportsDirectory: resolve(packageRoot, 'coverage'),
  include: ['src/**/*.ts', 'src/**/*.tsx'],
  exclude: ['**/node_modules/**', '**/test/**', 'src/**/*.spec.ts', 'src/**/*.spec.tsx', 'src/**/*.type.test.ts'],
  thresholds: {
    branches: 100,
    functions: 100,
    lines: 100,
    statements: 100,
  },
}
