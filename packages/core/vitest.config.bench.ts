import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/struct/struct.bench.ts'],
    pool: 'threads',
  },
})
