import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const browserConfig = fileURLToPath(new URL('./vitest.config.browser.ts', import.meta.url))

export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',
    },
    projects: [browserConfig],
  },
})
