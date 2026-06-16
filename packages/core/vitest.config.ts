import { defineConfig } from 'vitest/config'
import { coverageConfig } from './test/shared'

/**
 * Package-level workspace aggregator.
 *
 * Runs all Vitest projects defined for @defjs/core:
 * - Node runtime tests
 * - Browser runtime tests (Chromium + Firefox)
 *
 * Coverage configuration is centralized here so it applies across all projects
 * when running via the package test script.
 */
export default defineConfig({
  test: {
    coverage: {
      ...coverageConfig,
    },
    projects: ['./vitest.config.node.ts', './vitest.config.browser.ts'],
  },
})
