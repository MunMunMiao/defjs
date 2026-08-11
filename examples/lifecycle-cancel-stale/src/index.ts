import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Type each catalog query result before it can compete for publication.
export const searchWarehouseCatalog = defineRequest({
  method: 'GET',
  path: '/catalog/search',
  input: struct.request({ query: struct.object({ query: struct.string() }) }),
  output: [{ status: 200, body: struct.array(struct.string()) }],
})

// Step 2: Give one latest-search owner authority to abort superseded work and reject late completion.
export class LatestCatalogSearch {
  #current?: AbortController

  async search(client: Client, phrase: string): Promise<string[]> {
    const query = phrase.trim()
    if (!query) throw new TypeError('catalog query must not be empty')

    this.#current?.abort(new DOMException('catalog search superseded', 'AbortError'))
    const owner = new AbortController()
    this.#current = owner

    try {
      const [error, matches] = await client.execute(searchWarehouseCatalog({ query: { query } }), {
        signal: owner.signal,
      })
      if (error) throw error
      if (this.#current !== owner) {
        throw owner.signal.reason ?? new DOMException('catalog search superseded', 'AbortError')
      }
      return matches
    } finally {
      if (this.#current === owner) this.#current = undefined
    }
  }

  cancel(): void {
    this.#current?.abort(new DOMException('catalog search cancelled', 'AbortError'))
    this.#current = undefined
  }
}

function cancellationCode(error: unknown): 'ABORTED' {
  if (error instanceof DOMException && error.name === 'AbortError') return 'ABORTED'
  if (typeof error === 'object' && error !== null && 'kind' in error && error.kind === 'transport' && 'code' in error) {
    if (error.code === 'ABORTED') return 'ABORTED'
  }
  throw error
}

export async function main(): Promise<void> {
  // Step 3: Hold the broad query while the precise local result remains available.
  const firstStarted = Promise.withResolvers<void>()
  const releaseFirst = Promise.withResolvers<void>()
  const fixtureFetch: typeof fetch = async (input, init) => {
    const query = new URL(new Request(input, init).url).searchParams.get('query')
    if (query === 'thermal labels') {
      firstStarted.resolve()
      await releaseFirst.promise
      return new Response(JSON.stringify(['stale thermal labels']), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    }
    return new Response(JSON.stringify(['Zebra ZD421 thermal label printer']), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  }
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))

  // Step 4: Start the owned search sequence and supersede the broad request.
  const latest = new LatestCatalogSearch()
  const superseded = latest.search(client, 'thermal labels').then(() => 'COMPLETED' as const, cancellationCode)

  try {
    await firstStarted.promise
    const current = await latest.search(client, 'thermal label printer')
    releaseFirst.resolve()

    // Step 5: Emit the current result and the stale request classification.
    console.log(JSON.stringify({ current, superseded: await superseded }))
  } finally {
    // Step 6: Release the fixture barrier, cancel the owner, and await stale completion.
    releaseFirst.resolve()
    latest.cancel()
    await superseded
  }
}

if (import.meta.main) {
  await main()
}
