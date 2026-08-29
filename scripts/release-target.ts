import coreManifest from '../packages/core/package.json' with { type: 'json' }

type PackageDefinition = {
  packageName: string
  packageDir: string
}

const PACKAGES: Record<string, PackageDefinition> = {
  core: { packageName: '@defjs/core', packageDir: 'packages/core' },
  'opentelemetry-server': {
    packageName: '@defjs/opentelemetry-server',
    packageDir: 'packages/opentelemetry-server',
  },
  react: { packageName: '@defjs/react', packageDir: 'packages/react' },
  vue: { packageName: '@defjs/vue', packageDir: 'packages/vue' },
}

export type ReleaseTarget = {
  packageKey: string
  packageName: string
  packageDir: string
  version: string
  tarballFile: string
  coreVersion: string
}

export type PackageManifest = Record<string, unknown> & {
  name: string
  version: string
}

const STABLE_VERSION = '(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)'
const STABLE_VERSION_PATTERN = new RegExp(`^${STABLE_VERSION}$`)
const RELEASE_TAG = new RegExp(`^release-([a-z][a-z0-9-]*)-v(${STABLE_VERSION})$`)

function parseStableVersion(value: unknown, source: string): string {
  if (typeof value !== 'string' || !STABLE_VERSION_PATTERN.test(value)) {
    throw new Error(`Invalid stable SemVer in ${source}`)
  }
  return value
}

export function parseReleaseTag(tag: string, coreVersion?: unknown): ReleaseTarget {
  const match = RELEASE_TAG.exec(tag)
  if (!match) throw new Error(`Invalid release tag: ${JSON.stringify(tag)}`)

  const [, packageKey, rawVersion] = match
  const version = parseStableVersion(rawVersion, 'release tag')
  const manifestVersion = parseStableVersion(arguments.length === 2 ? coreVersion : coreManifest.version, 'Core package manifest')
  const definition = PACKAGES[packageKey]
  if (!Object.hasOwn(PACKAGES, packageKey) || !definition) throw new Error(`Unknown release package: ${packageKey}`)

  return {
    packageKey,
    packageName: definition.packageName,
    packageDir: definition.packageDir,
    version,
    tarballFile: `defjs-${packageKey}-${version}.tgz`,
    coreVersion: manifestVersion,
  }
}

export function validateReleaseManifest(target: ReleaseTarget, manifest: unknown): PackageManifest {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new Error('Package manifest must be an object')
  }

  const candidate = manifest as Record<string, unknown>
  if (candidate.name !== target.packageName) {
    throw new Error(`Package manifest name does not match ${target.packageName}`)
  }
  if (candidate.version !== target.version) {
    throw new Error(`Package manifest version does not match ${target.version}`)
  }
  return candidate as PackageManifest
}

export async function loadReleaseManifest(target: ReleaseTarget): Promise<PackageManifest> {
  return validateReleaseManifest(target, await Bun.file(`${target.packageDir}/package.json`).json())
}

function githubOutput(target: ReleaseTarget): string {
  return (
    [
      `package_key=${target.packageKey}`,
      `package_name=${target.packageName}`,
      `package_dir=${target.packageDir}`,
      `version=${target.version}`,
      `tarball_file=${target.tarballFile}`,
      `core_version=${target.coreVersion}`,
    ].join('\n') + '\n'
  )
}

async function writeGitHubOutput(output: string): Promise<void> {
  const outputPath = Bun.env.GITHUB_OUTPUT
  if (!outputPath) {
    await Bun.write(Bun.stdout, output)
    return
  }
  const existing = await Bun.file(outputPath)
    .text()
    .catch(() => '')
  await Bun.write(outputPath, existing + output)
}

if (import.meta.main) {
  const tag = Bun.argv[2]
  if (!tag) throw new Error('Usage: bun scripts/release-target.ts <release-tag>')
  const target = parseReleaseTag(tag)
  await loadReleaseManifest(target)
  await writeGitHubOutput(githubOutput(target))
}
