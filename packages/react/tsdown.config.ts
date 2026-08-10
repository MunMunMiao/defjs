import { readFile, writeFile } from 'node:fs/promises'
import { defineConfig, type UserConfig } from 'tsdown'
import { copyPackageDocs } from '../../scripts/copy-package-docs.mjs'

async function writeDistPackageJson(): Promise<void> {
  const packageJson = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8')) as Record<string, unknown>

  packageJson['main'] = './index.js'
  packageJson['module'] = './index.js'
  packageJson['types'] = './index.d.ts'
  packageJson['typings'] = './index.d.ts'
  packageJson['exports'] = {
    './package.json': './package.json',
    '.': {
      types: './index.d.ts',
      default: './index.js',
    },
  }
  delete packageJson['scripts']
  delete packageJson['devDependencies']
  delete packageJson['private']
  delete packageJson['publishConfig']

  await writeFile(new URL('./dist/package.json', import.meta.url), `${JSON.stringify(packageJson, undefined, 2)}\n`)
  await copyPackageDocs(new URL('.', import.meta.url))
}

export default defineConfig({
  format: 'esm',
  outDir: 'dist',
  platform: 'neutral',
  target: false,
  tsconfig: 'tsconfig.build.json',
  clean: true,
  dts: true,
  entry: {
    index: 'src/public_api.ts',
  },
  banner: {
    js: "'use client';",
  },
  inputOptions: {
    resolve: {
      mainFields: ['module', 'main'],
    },
  },
  deps: {
    neverBundle: ['react', 'react-dom', '@defjs/core'],
  },
  copy: ['../../LICENSE', './README.md'],
  hooks: {
    async 'build:done'() {
      await writeDistPackageJson()
    },
  },
} satisfies UserConfig)
