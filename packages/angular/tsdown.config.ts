import { readFile, writeFile } from 'node:fs/promises'
import { defineConfig } from 'tsdown'

async function rewritePackageJson(outDir: string): Promise<void> {
  const raw = await readFile('./package.json', 'utf8')
  const pkg = JSON.parse(raw) as Record<string, unknown>

  delete pkg.devDependencies
  delete pkg.scripts

  pkg.module = 'index.js'
  pkg.typings = 'index.d.ts'
  pkg.exports = {
    './package.json': './package.json',
    '.': {
      types: './index.d.ts',
      default: './index.js',
    },
  }

  await writeFile(`${outDir}/package.json`, JSON.stringify(pkg, undefined, 2))
}

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
  external: ['@angular/common', '@angular/core', '@defjs/core'],
  copy: ['../../LICENSE', './README.md'],
  hooks: {
    async 'build:done'({ options }) {
      await rewritePackageJson(options.outDir)
    },
  },
})
