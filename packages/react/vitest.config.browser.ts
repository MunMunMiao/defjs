import { resolve } from 'node:path'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import { globalSetupPath, packageRoot } from './test/shared'

export default defineConfig({
  root: packageRoot,
  resolve: {
    alias: {
      '@defjs/core': resolve(packageRoot, '../core/src'),
    },
  },
  test: {
    name: 'react-browser',
    globalSetup: globalSetupPath,
    browser: {
      enabled: true,
      provider: playwright(),
      connectTimeout: 120_000,
      headless: true,
      screenshotFailures: false,
      instances: [
        {
          browser: 'chromium',
          include: ['src/**/*.browser.spec.tsx', 'src/**/*.chrome.spec.tsx'],
        },
        {
          browser: 'firefox',
          include: ['src/**/*.browser.spec.tsx', 'src/**/*.firefox.spec.tsx'],
        },
      ],
    },
  },
})
