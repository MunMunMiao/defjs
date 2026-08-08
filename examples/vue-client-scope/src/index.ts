import { createClient, defineRequest, struct, type Infer, withHTTPHandle } from '@defjs/core'
import { HTTP_CLIENT, injectClient, provideClient, withEndpoint } from '@defjs/vue'
import { defineComponent, h, nextTick, onMounted, onUnmounted, provide, type PropType } from 'vue'
import { createHostRoot, hostRenderer } from './renderer'

// Step 1: Type summaries independently of the injected client scope that selects their service.
const scopeSummaryStruct = struct.object({ service: struct.string(), view: struct.string() })
export type ScopeSummary = Infer<typeof scopeSummaryStruct>
export const loadLogisticsSummary = defineRequest({
  method: 'GET',
  path: '/v1/summary',
  input: struct.request({ query: struct.object({ view: struct.string() }) }),
  output: [{ status: 200, body: scopeSummaryStruct }] as const,
})

// Step 2: Let each view own an abortable request while the nearest Vue provider selects its endpoint.
const SummaryView = defineComponent({
  props: {
    onError: { type: Function as PropType<(error: unknown) => void>, required: true },
    onSummary: { type: Function as PropType<(summary: ScopeSummary) => void>, required: true },
    view: { type: String, required: true },
  },
  setup(props) {
    const client = injectClient()
    const owner = new AbortController()

    async function load(): Promise<void> {
      const [error, summary, response] = await client.execute(loadLogisticsSummary({ query: { view: props.view } }), {
        signal: owner.signal,
      })
      if (owner.signal.aborted) return
      if (error) throw error
      if (response.error) throw response.error
      props.onSummary(summary)
    }

    onMounted(() => {
      void load().catch((error: unknown) => {
        if (!owner.signal.aborted) props.onError(error)
      })
    })
    onUnmounted(() => owner.abort())
    return () => null
  },
})

const CustomsScope = defineComponent({
  props: {
    handle: { type: Function as PropType<typeof fetch>, required: true },
    onError: { type: Function as PropType<(error: unknown) => void>, required: true },
    onSummary: { type: Function as PropType<(summary: ScopeSummary) => void>, required: true },
  },
  setup(props) {
    provide(HTTP_CLIENT, createClient(withEndpoint('https://customs.fixture.invalid'), withHTTPHandle(props.handle)))
    return () => h(SummaryView, { onError: props.onError, onSummary: props.onSummary, view: 'customs-holds' })
  },
})
export const ScopedLogisticsWorkspace = defineComponent({
  props: {
    handle: { type: Function as PropType<typeof fetch>, required: true },
    onError: { type: Function as PropType<(error: unknown) => void>, required: true },
    onSummary: { type: Function as PropType<(summary: ScopeSummary) => void>, required: true },
  },
  setup(props) {
    return () => [
      h(SummaryView, { onError: props.onError, onSummary: props.onSummary, view: 'shipment-board' }),
      h(CustomsScope, { handle: props.handle, onError: props.onError, onSummary: props.onSummary }),
    ]
  },
})

export async function main(): Promise<void> {
  // Step 3: Route local summaries by the endpoint selected through Vue injection.
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

  // Step 4: Mount the app plugin and nested customs provider.
  const root = createHostRoot()
  const app = hostRenderer.createApp(ScopedLogisticsWorkspace, {
    handle: fixtureFetch,
    onError: ready.reject,
    onSummary,
  })
  app.use(provideClient(withEndpoint('https://logistics.fixture.invalid'), withHTTPHandle(fixtureFetch)))
  app.mount(root)
  try {
    await ready.promise
  } finally {
    // Step 5: Unmount the app and wait for Vue cleanup.
    app.unmount()
    await nextTick()
  }

  // Step 6: Emit the service resolved for each dashboard view.
  console.log(
    JSON.stringify({
      customsHolds: summaries.get('customs-holds')?.service,
      shipmentBoard: summaries.get('shipment-board')?.service,
    }),
  )
}

if (import.meta.main) {
  await main()
}
