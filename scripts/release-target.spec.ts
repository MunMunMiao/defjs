import { describe, expect, test } from 'bun:test'
import coreManifest from '../packages/core/package.json' with { type: 'json' }
import { parseReleaseTag, validateReleaseManifest, type ReleaseTarget } from './release-target'

const validTags: Array<[string, ReleaseTarget]> = [
  [
    'release-core-v0.4.0',
    {
      packageKey: 'core',
      packageName: '@defjs/core',
      packageDir: 'packages/core',
      version: '0.4.0',
      tarballFile: 'defjs-core-0.4.0.tgz',
      coreVersion: coreManifest.version,
    },
  ],
  [
    'release-opentelemetry-server-v0.2.0',
    {
      packageKey: 'opentelemetry-server',
      packageName: '@defjs/opentelemetry-server',
      packageDir: 'packages/opentelemetry-server',
      version: '0.2.0',
      tarballFile: 'defjs-opentelemetry-server-0.2.0.tgz',
      coreVersion: coreManifest.version,
    },
  ],
  [
    'release-react-v0.0.1',
    {
      packageKey: 'react',
      packageName: '@defjs/react',
      packageDir: 'packages/react',
      version: '0.0.1',
      tarballFile: 'defjs-react-0.0.1.tgz',
      coreVersion: coreManifest.version,
    },
  ],
  [
    'release-vue-v0.0.1',
    {
      packageKey: 'vue',
      packageName: '@defjs/vue',
      packageDir: 'packages/vue',
      version: '0.0.1',
      tarballFile: 'defjs-vue-0.0.1.tgz',
      coreVersion: coreManifest.version,
    },
  ],
]

describe('parseReleaseTag', () => {
  test.each(validTags)('parses %s', (tag, expected) => {
    expect(parseReleaseTag(tag)).toEqual(expected)
  })

  test.each([
    'release-core-v1',
    'release-core-v1.2',
    'release-core-v1.2.3.4',
    'release-core-v01.2.3',
    'release-core-v1.2.3-alpha.1',
    'release-core-v1.2.3+build.1',
    'release-core-v1.2.3;touch /tmp/pwned',
    'release-core-v1.2.3\nGITHUB_OUTPUT<<x',
    'release-unknown-v1.2.3',
    'release-constructor-v1.2.3',
    'release-core-v1.2.3/../../x',
    'release-core-v1.2.3 ',
  ])('rejects malformed or injectable tag %s', (tag) => {
    expect(() => parseReleaseTag(tag)).toThrow()
  })

  test.each(['0.4.0\npackage_name=@evil/x', '0.4.0-alpha.1', '0.4.0+build.1', '00.4.0', 0.4, null, undefined, { version: '0.4.0' }])(
    'rejects an unsafe Core manifest version %p',
    (coreVersion) => {
      expect(() => parseReleaseTag('release-react-v0.0.1', coreVersion)).toThrow()
    },
  )
})

describe('validateReleaseManifest', () => {
  const target = validTags[0][1]

  test('returns a validated package manifest', () => {
    expect(
      validateReleaseManifest(target, {
        name: target.packageName,
        version: target.version,
        files: ['dist/index.js'],
      }),
    ).toEqual({
      name: target.packageName,
      version: target.version,
      files: ['dist/index.js'],
    })
  })

  test.each([{ name: '@defjs/not-core', version: target.version }, { name: target.packageName, version: '9.9.9' }, null, 'not an object'])(
    'rejects an invalid manifest %#',
    (manifest) => {
      expect(() => validateReleaseManifest(target, manifest)).toThrow()
    },
  )
})

describe('release-target CLI', () => {
  async function runCli(tag: string, outputPath?: string) {
    const env = { ...Bun.env }
    if (outputPath) env.GITHUB_OUTPUT = outputPath
    else delete env.GITHUB_OUTPUT
    const process = Bun.spawn(['bun', 'scripts/release-target.ts', tag], {
      cwd: new URL('..', import.meta.url).pathname,
      env,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    return {
      exitCode: await process.exited,
      stdout: await new Response(process.stdout).text(),
    }
  }

  test('writes exactly the six GitHub outputs and nothing to stdout', async () => {
    const outputPath = `/tmp/release-target-${crypto.randomUUID()}.out`
    const tag = `release-core-v${coreManifest.version}`
    try {
      const result = await runCli(tag, outputPath)
      expect(result).toEqual({ exitCode: 0, stdout: '' })
      expect(await Bun.file(outputPath).text()).toBe(
        [
          'package_key=core',
          'package_name=@defjs/core',
          'package_dir=packages/core',
          `version=${coreManifest.version}`,
          `tarball_file=defjs-core-${coreManifest.version}.tgz`,
          `core_version=${coreManifest.version}`,
          '',
        ].join('\n'),
      )
    } finally {
      await Bun.file(outputPath).delete()
    }
  })

  test('rejects an invalid tag without changing existing output', async () => {
    const outputPath = `/tmp/release-target-${crypto.randomUUID()}.out`
    try {
      await Bun.write(outputPath, 'existing-output\n')
      const result = await runCli('release-core-v1.2.3-alpha.1', outputPath)
      expect(result.exitCode).not.toBe(0)
      expect(await Bun.file(outputPath).text()).toBe('existing-output\n')
    } finally {
      await Bun.file(outputPath).delete()
    }
  })

  test('writes the six outputs to stdout when GITHUB_OUTPUT is unset', async () => {
    const result = await runCli(`release-core-v${coreManifest.version}`)
    expect(result).toEqual({
      exitCode: 0,
      stdout: [
        'package_key=core',
        'package_name=@defjs/core',
        'package_dir=packages/core',
        `version=${coreManifest.version}`,
        `tarball_file=defjs-core-${coreManifest.version}.tgz`,
        `core_version=${coreManifest.version}`,
        '',
      ].join('\n'),
    })
  })
})
