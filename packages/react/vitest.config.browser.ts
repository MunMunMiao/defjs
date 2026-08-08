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
    dedupe: ['react', 'react-dom', 'react-dom/client'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom/client', '@testing-library/react'],
  },
  test: {
    name: 'react-browser',
    globalSetup: globalSetupPath,
    browser: {
      enabled: true,
      api: 63317,
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
