import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packageRoot = dirname(fileURLToPath(import.meta.url))
export const globalSetupPath = resolve(packageRoot, 'test-setup.ts')
export const runtimeSpecificSpecPatterns = [
  'src/**/*.node.spec.ts',
  'src/**/*.bun.spec.ts',
  'src/**/*.deno.spec.ts',
  'src/**/*.browser.spec.ts',
  'src/**/*.chrome.spec.ts',
  'src/**/*.firefox.spec.ts',
  'src/**/*.safari.spec.ts',
]
export const coverageConfig = {
  enabled: false,
  provider: 'istanbul' as const,
  reporter: ['lcov', 'json', 'html', 'text'],
  reportsDirectory: resolve(packageRoot, 'coverage'),
  include: ['src/**/*.ts'],
  exclude: ['**/node_modules/**', '**/test/**', 'src/**/*.spec.ts', 'src/**/*.type.test.ts'],
  thresholds: {
    branches: 100,
    functions: 100,
    lines: 100,
    statements: 100,
  },
}
