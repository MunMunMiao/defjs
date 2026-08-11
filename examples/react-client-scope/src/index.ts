import { createClient, defineRequest, struct, type Client, type Infer, withEndpoint, withHTTPHandle } from '@defjs/core'
import { ClientProvider, useClient } from '@defjs/react'
import { createElement, useEffect } from 'react'
import { mountReactFixture } from './renderer'

// Step 1: Type summaries independently of the provider scope that selects their service.
const scopeSummaryStruct = struct.object({ service: struct.string(), view: struct.string() })
export type ScopeSummary = Infer<typeof scopeSummaryStruct>
export const loadSupportSummary = defineRequest({
  method: 'GET',
  path: '/v1/summary',
  input: struct.request({ query: struct.object({ view: struct.string() }) }),
  output: [{ status: 200, body: scopeSummaryStruct }],
})

// Step 2: Bind each view's abortable request to the nearest provider-resolved Defjs client.
function SummaryView({
  onError,
  onSummary,
  view,
}: {
  onError: (error: unknown) => void
  onSummary: (summary: ScopeSummary) => void
  view: string
}) {
  const client = useClient()

  useEffect(() => {
    const owner = new AbortController()

    async function load(): Promise<void> {
      const [error, summary, response] = await client.execute(loadSupportSummary({ query: { view } }), {
        signal: owner.signal,
      })
      if (owner.signal.aborted) return
      if (error) throw error
      if (response.error) throw response.error
      onSummary(summary)
    }

    void load().catch((error: unknown) => {
      if (!owner.signal.aborted) onError(error)
    })
    return () => owner.abort()
  }, [client, onError, onSummary, view])

  return null
}
export function SupportWorkspace({
  onError,
  onSummary,
  refundsClient,
  supportClient,
}: {
  onError: (error: unknown) => void
  onSummary: (summary: ScopeSummary) => void
  refundsClient: Client
  supportClient: Client
}) {
  return createElement(
    ClientProvider,
    { client: supportClient },
    createElement(SummaryView, { onError, onSummary, view: 'case-queue' }),
    createElement(ClientProvider, { client: refundsClient }, createElement(SummaryView, { onError, onSummary, view: 'refund-review' })),
  )
}

export async function main(): Promise<void> {
  // Step 3: Route local summary responses by the client endpoint origin.
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const service = url.hostname.split('.')[0] ?? 'unknown'
    const view = url.searchParams.get('view') ?? ''
    return new Response(JSON.stringify({ service, view }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  }

  const ready = Promise.withResolvers<void>()
  const summaries = new Map<string, ScopeSummary>()
  const onSummary = (summary: ScopeSummary) => {
    summaries.set(summary.view, summary)
    if (summaries.size === 2) ready.resolve()
  }

  // Step 4: Mount the provider tree and wait for both scoped views.
  const supportClient = createClient(withEndpoint('https://support.fixture.invalid'), withHTTPHandle(fixtureFetch))
  const refundsClient = createClient(withEndpoint('https://refunds.fixture.invalid'), withHTTPHandle(fixtureFetch))
  const renderer = await mountReactFixture(
    createElement(SupportWorkspace, { onError: ready.reject, onSummary, refundsClient, supportClient }),
  )
  try {
    await ready.promise
  } finally {
    // Step 5: Unmount the renderer and settle its effects.
    await renderer.unmount()
  }

  // Step 6: Emit the service selected for each support view.
  console.log(
    JSON.stringify({
      caseQueue: summaries.get('case-queue')?.service,
      refundReview: summaries.get('refund-review')?.service,
    }),
  )
}

if (import.meta.main) {
  await main()
}
