import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: 'istanbul',
      reporter: ['lcov', 'json', 'html', 'text'],
      reportsDirectory: 'coverage',
      include: ['packages/core/src/**/*.ts'],
      exclude: ['**/node_modules/**', '**/test/**', '**/src/**/*.spec.ts'],
      thresholds: {
        ['100']: true,
      },
    },
    browser: {
      enabled: false,
      provider: 'webdriverio',
      headless: true,
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
    },
  },
})
