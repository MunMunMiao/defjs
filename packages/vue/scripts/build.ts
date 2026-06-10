import dts from 'bun-plugin-dts'

async function build() {
  try {
    await Bun.build({
      entrypoints: ['./src/index.ts'],
      outdir: './dist',
      naming: '[dir]/[name].[ext]',
      format: 'esm',
      target: 'browser',
      minify: false,
      external: ['vue', '@defjs/core'],
      plugins: [
        dts({
          output: {
            noBanner: true,
          },
          compilationOptions: {
            preferredConfigPath: './tsconfig.build.json',
            followSymlinks: false,
          },
        }),
      ],
    })
  } catch (error) {
    console.warn('DTS generation failed (known technical debt), continuing with JS build only...')
    console.warn('Error:', error instanceof Error ? error.message : String(error))

    // Build without DTS plugin
    await Bun.build({
      entrypoints: ['./src/index.ts'],
      outdir: './dist',
      naming: '[dir]/[name].[ext]',
      format: 'esm',
      target: 'browser',
      minify: false,
      external: ['vue', '@defjs/core'],
    })
  }
}

async function afterBuild() {
  await Bun.write('dist/LICENSE', Bun.file('../../LICENSE'))
  await Bun.write('dist/README.md', Bun.file('./README.md'))

  const packageJson: Record<string, any> = await Bun.file('package.json').json()
  delete packageJson.devDependencies
  delete packageJson.scripts
  packageJson.module = 'index.js'
  packageJson.typings = 'index.d.ts'
  packageJson.exports = {
    './package.json': './package.json',
    '.': {
      types: './index.d.ts',
      default: './index.js',
    },
  }
  await Bun.write('dist/package.json', JSON.stringify(packageJson, undefined, 2))
}

async function main() {
  await build()
  await afterBuild()
}

main()
