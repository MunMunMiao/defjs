import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function rewritePackageJson(packageDir: string, outDir: string): Promise<void> {
  const raw = await readFile(resolve(packageDir, 'package.json'), 'utf8')
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

  await writeFile(resolve(packageDir, outDir, 'package.json'), JSON.stringify(pkg, undefined, 2))
}
