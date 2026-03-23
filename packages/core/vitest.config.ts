import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { webdriverio } from '@vitest/browser-webdriverio'
import { defineConfig } from 'vitest/config'

const packageRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: packageRoot,
  test: {
    include: ['src/**/*.spec.ts'],
    globalSetup: resolve(packageRoot, 'test-setup.ts'),
    coverage: {
      enabled: true,
      provider: 'istanbul',
      reporter: ['lcov', 'json', 'html', 'text'],
      reportsDirectory: resolve(packageRoot, 'coverage'),
      include: ['src/**/*.ts'],
      exclude: ['**/node_modules/**', '**/test/**', 'src/**/*.spec.ts'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
    browser: {
      enabled: false,
      provider: webdriverio(),
      headless: true,
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
    },
  },
})
