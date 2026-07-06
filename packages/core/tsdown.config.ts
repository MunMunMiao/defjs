import { defineConfig } from 'tsdown'
import { rewritePackageJson } from '../../scripts/rewrite-package-json.ts'

export default defineConfig([
  {
    entry: ['./src/index.ts'],
    outDir: './dist',
    format: 'esm',
    platform: 'browser',
    target: 'esnext',
    dts: false,
    clean: true,
    minify: true,
    sourcemap: false,
    tsconfig: './tsconfig.build.json',
    outExtensions: () => ({ js: '.min.js' }),
  },
  {
    entry: ['./src/index.ts'],
    outDir: './dist',
    format: 'esm',
    platform: 'browser',
    target: 'esnext',
    dts: true,
    clean: false,
    minify: false,
    sourcemap: false,
    tsconfig: './tsconfig.build.json',
    copy: ['../../LICENSE', './README.md'],
    hooks: {
      async 'build:done'({ options }) {
        await rewritePackageJson(import.meta.dirname, options.outDir)
      },
    },
  },
])
