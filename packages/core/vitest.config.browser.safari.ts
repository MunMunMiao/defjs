import { webdriverio } from '@vitest/browser-webdriverio'
import { defineConfig } from 'vitest/config'
import { globalSetupPath, packageRoot } from './vitest.shared'

export default defineConfig({
  root: packageRoot,
  test: {
    name: 'core-browser-safari',
    include: ['src/**/*.browser.spec.ts', 'src/**/*.safari.spec.ts'],
    globalSetup: globalSetupPath,
    maxWorkers: 1,
    fileParallelism: false,
    coverage: {
      enabled: false,
    },
    browser: {
      enabled: true,
      provider: webdriverio(),
      connectTimeout: 120_000,
      headless: false,
      screenshotFailures: false,
      instances: [{ browser: 'safari' }],
    },
  },
})
