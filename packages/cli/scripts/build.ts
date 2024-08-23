async function generate() {
  await Bun.build({
    entrypoints: ['./src/main.ts'],
    outdir: './dist',
    naming: '[dir]/[name].[ext]',
    format: 'esm',
    target: 'node',
    minify: false,
    external: ['commander', 'typescript'],
  })
}

async function afterGenerate() {
  await Bun.write('dist/LICENSE', Bun.file('../../LICENSE'))
  await Bun.write('dist/README.md', Bun.file('./README.md'))

  const packageJson: Record<string, any> = await Bun.file('package.json').json()
  delete packageJson.devDependencies
  delete packageJson.scripts
  packageJson.bin = 'index.js'
  packageJson.main = 'index.js'
  packageJson.module = 'index.js'
  await Bun.write('dist/package.json', JSON.stringify(packageJson, undefined, 2))
}

async function main() {
  await generate()
  await afterGenerate()
}

main()
