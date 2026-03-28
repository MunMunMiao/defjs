import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'packages/core/vitest.config.node.ts',
      'packages/core/vitest.config.bun.ts',
      'packages/core/vitest.config.deno.ts',
      'packages/core/vitest.config.browser.chrome.ts',
      'packages/core/vitest.config.browser.firefox.ts',
      'packages/core/vitest.config.browser.safari.ts',
    ],
  },
})
