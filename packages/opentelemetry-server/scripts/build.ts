async function build() {
  // Use tsc to compile TypeScript to JS and generate declarations
  const proc = Bun.spawn({
    cmd: ['npx', 'tsc', '--project', 'tsconfig.build.json'],
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const exitCode = await proc.exited
  const stderr = await new Response(proc.stderr).text()
  const stdout = await new Response(proc.stdout).text()

  if (exitCode !== 0) {
    console.error('tsc failed:')
    if (stdout) {
      console.error(stdout)
    }
    if (stderr) {
      console.error(stderr)
    }
    throw new Error(`tsc exited with code ${exitCode}`)
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
