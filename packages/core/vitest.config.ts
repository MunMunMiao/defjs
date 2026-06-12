import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const nodeConfig = fileURLToPath(new URL('./vitest.config.node.ts', import.meta.url))
const browserConfig = fileURLToPath(new URL('./vitest.config.browser.ts', import.meta.url))

export default defineConfig({
  test: {
    projects: [nodeConfig, browserConfig],
  },
  coverage: {
    enabled: true,
    provider: 'istanbul',
  },
})
