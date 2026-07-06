import { defineConfig } from 'tsdown'
import { rewritePackageJson } from '../../scripts/rewrite-package-json.ts'

export default defineConfig({
  entry: ['./src/index.ts'],
  outDir: './dist',
  format: 'esm',
  platform: 'browser',
  target: 'esnext',
  dts: true,
  clean: true,
  minify: false,
  sourcemap: false,
  tsconfig: './tsconfig.build.json',
  deps: {
    neverBundle: ['@defjs/core', '@opentelemetry/api', '@opentelemetry/core'],
  },
  copy: ['../../LICENSE', './README.md'],
  hooks: {
    async 'build:done'({ options }) {
      await rewritePackageJson(import.meta.dirname, options.outDir)
    },
  },
})
