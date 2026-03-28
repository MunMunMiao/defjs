import { webdriverio } from '@vitest/browser-webdriverio'
import { defineConfig } from 'vitest/config'
import { globalSetupPath, packageRoot } from './vitest.shared'

export default defineConfig({
  root: packageRoot,
  test: {
    name: 'core-browser-chrome',
    include: ['src/**/*.browser.spec.ts', 'src/**/*.chrome.spec.ts'],
    globalSetup: globalSetupPath,
    coverage: {
      enabled: false,
    },
    browser: {
      enabled: true,
      provider: webdriverio(),
      connectTimeout: 120_000,
      headless: true,
      screenshotFailures: false,
      instances: [{ browser: 'chrome' }],
    },
  },
})
