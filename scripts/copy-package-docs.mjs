import { cp, lstat, mkdir } from 'node:fs/promises'

const repositoryRoot = new URL('../', import.meta.url)
const skipSymbolicLinks = async (source) => !(await lstat(source)).isSymbolicLink()

/** @param {URL} packageDirectory */
export async function copyPackageDocs(packageDirectory) {
  const outputDirectory = new URL('./dist/', packageDirectory)
  const idempotencyExampleDirectory = new URL('examples/resilience-idempotency-key/', outputDirectory)
  const redactedLoggingExampleDirectory = new URL('examples/observability-redacted-logging/', outputDirectory)

  await Promise.all([mkdir(idempotencyExampleDirectory, { recursive: true }), mkdir(redactedLoggingExampleDirectory, { recursive: true })])

  await Promise.all([
    cp(new URL('doc/core/', repositoryRoot), new URL('docs/core/', outputDirectory), { filter: skipSymbolicLinks, recursive: true }),
    cp(new URL('doc/guide/', repositoryRoot), new URL('docs/guide/', outputDirectory), { filter: skipSymbolicLinks, recursive: true }),
    cp(new URL('doc/plugins/', repositoryRoot), new URL('docs/plugins/', outputDirectory), { filter: skipSymbolicLinks, recursive: true }),
    cp(new URL('examples/resilience-idempotency-key/README.md', repositoryRoot), new URL('README.md', idempotencyExampleDirectory)),
    cp(new URL('examples/resilience-idempotency-key/src/', repositoryRoot), new URL('src/', idempotencyExampleDirectory), {
      filter: skipSymbolicLinks,
      recursive: true,
    }),
    cp(new URL('examples/observability-redacted-logging/README.md', repositoryRoot), new URL('README.md', redactedLoggingExampleDirectory)),
    cp(new URL('examples/observability-redacted-logging/src/', repositoryRoot), new URL('src/', redactedLoggingExampleDirectory), {
      filter: skipSymbolicLinks,
      recursive: true,
    }),
  ])
}
