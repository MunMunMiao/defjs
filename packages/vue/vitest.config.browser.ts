import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import { coverageConfig, globalSetupPath, packageRoot } from './test/shared'

export default defineConfig({
  root: packageRoot,
  test: {
    name: 'vue-browser',
    globalSetup: globalSetupPath,
    coverage: {
      ...coverageConfig,
    },
    browser: {
      enabled: true,
      provider: playwright(),
      connectTimeout: 120_000,
      headless: true,
      screenshotFailures: false,
      instances: [
        {
          browser: 'chromium',
          include: ['src/**/*.browser.spec.ts', 'src/**/*.chrome.spec.ts'],
        },
        {
          browser: 'firefox',
          include: ['src/**/*.browser.spec.ts', 'src/**/*.firefox.spec.ts'],
        },
      ],
    },
  },
})
