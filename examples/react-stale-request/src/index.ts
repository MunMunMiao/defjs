import { defineRequest, struct, type Infer, withEndpoint, withHTTPHandle } from '@defjs/core'
import { ClientProvider, useClient } from '@defjs/react'
import { createElement, useEffect } from 'react'
import { holdUntilAbort } from './fixture'
import { mountReactFixture } from './renderer'

// Step 1: Type only catalog products eligible to enter React state.
const catalogProductStruct = struct.object({ name: struct.string(), sku: struct.string() })
export type CatalogProduct = Infer<typeof catalogProductStruct>
export const searchCatalog = defineRequest({
  method: 'GET',
  path: '/v1/catalog/search',
  input: struct.request({ query: struct.object({ query: struct.string() }) }),
  output: [
    {
      status: 200,
      body: struct.array(catalogProductStruct),
    },
  ] as const,
})

// Step 2: Give each query effect an abort owner and suppress publication after cleanup.
export function CatalogSearchEffect({
  onError,
  onResult,
  query,
}: {
  onError: (error: unknown) => void
  onResult: (products: CatalogProduct[]) => void
  query: string
}) {
  const client = useClient()

  useEffect(() => {
    const owner = new AbortController()

    async function search(): Promise<void> {
      const [error, products, response] = await client.execute(searchCatalog({ query: { query: query.trim() } }), { signal: owner.signal })
      if (owner.signal.aborted) return
      if (error) throw error
      if (response.error) throw response.error
      onResult(products)
    }

    void search().catch((error: unknown) => {
      if (!owner.signal.aborted) onError(error)
    })
    return () => owner.abort()
  }, [client, onError, onResult, query])

  return null
}

export async function main(): Promise<void> {
  // Step 3: Hold the broad query until React effect cleanup aborts it.
  const stale = holdUntilAbort()
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.searchParams.get('query') === 'thermal labels') return stale.respond(request)

    return new Response(JSON.stringify([{ name: 'Zebra ZD421 label printer', sku: 'ZD421' }]), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  }

  const result = Promise.withResolvers<CatalogProduct[]>()
  const options = [withEndpoint('https://catalog.fixture.invalid'), withHTTPHandle(fixtureFetch)]
  const tree = (query: string) =>
    createElement(
      ClientProvider,
      { options },
      createElement(CatalogSearchEffect, { onError: result.reject, onResult: result.resolve, query }),
    )

  // Step 4: Mount the broad search, then update to the precise query.
  const renderer = await mountReactFixture(tree('thermal labels'))
  try {
    await stale.started
    await renderer.update(tree('thermal label printer'))
    await Promise.all([stale.aborted, result.promise])
  } finally {
    // Step 5: Unmount the renderer after stale cancellation and latest completion.
    await renderer.unmount()
  }

  // Step 6: Emit only the validated products from the latest effect.
  console.log(JSON.stringify({ query: 'thermal label printer', products: await result.promise }))
}

if (import.meta.main) {
  await main()
}
