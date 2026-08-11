import { createClient, defineRequest, struct, type Infer, withEndpoint, withHTTPHandle } from '@defjs/core'
import { createClientPlugin, injectClient } from '@defjs/vue'
import { defineComponent, nextTick, ref, watch, type ComponentPublicInstance, type PropType } from 'vue'
import { holdUntilAbort } from './fixture'
import { createHostRoot, hostRenderer } from './renderer'

// Step 1: Type only customer matches eligible for reactive component state.
const customerMatchStruct = struct.object({ customerId: struct.string(), name: struct.string() })
export type CustomerMatch = Infer<typeof customerMatchStruct>
export const searchCustomers = defineRequest({
  method: 'GET',
  path: '/v1/customers/search',
  input: struct.request({ query: struct.object({ query: struct.string() }) }),
  output: [
    {
      status: 200,
      body: struct.array(customerMatchStruct),
    },
  ],
})

// Step 2: Give each watcher run an abort owner and publish only while that run remains current.
export const ReactiveCustomerSearch = defineComponent({
  props: {
    onError: { type: Function as PropType<(error: unknown) => void>, required: true },
    onResult: { type: Function as PropType<(matches: CustomerMatch[]) => void>, required: true },
  },
  setup(props) {
    const client = injectClient()
    const query = ref('')
    const customers = ref<CustomerMatch[]>([])

    watch(query, (value, _previous, onCleanup) => {
      const owner = new AbortController()
      onCleanup(() => owner.abort())

      async function search(): Promise<void> {
        const [error, matches, response] = await client.execute(searchCustomers({ query: { query: value.trim() } }), {
          signal: owner.signal,
        })
        if (owner.signal.aborted) return
        if (error) throw error
        if (response.error) throw response.error
        customers.value = matches
        props.onResult(matches)
      }

      void search().catch((error: unknown) => {
        if (!owner.signal.aborted) props.onError(error)
      })
    })

    return { customers, query }
  },
  render: () => null,
})

type CustomerSearchInstance = ComponentPublicInstance & { customers: CustomerMatch[]; query: string }

export async function main(): Promise<void> {
  // Step 3: Hold the broad customer query until its watcher run is invalidated.
  const stale = holdUntilAbort()
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.searchParams.get('query') === 'morgan') return stale.respond(request)

    return new Response(JSON.stringify([{ customerId: 'cus-204', name: 'Morgan Lee' }]), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  }

  // Step 4: Mount the component and change its public query to the precise phrase.
  const result = Promise.withResolvers<CustomerMatch[]>()
  const root = createHostRoot()
  const app = hostRenderer.createApp(ReactiveCustomerSearch, { onError: result.reject, onResult: result.resolve })
  const client = createClient(withEndpoint('https://customers.fixture.invalid'), withHTTPHandle(fixtureFetch))
  app.use(createClientPlugin(client))
  const instance = app.mount(root) as CustomerSearchInstance
  let visibleCustomers: CustomerMatch[] = []
  try {
    instance.query = 'morgan'
    await nextTick()
    await stale.started
    instance.query = 'morgan lee'
    await nextTick()
    await Promise.all([stale.aborted, result.promise])
    visibleCustomers = instance.customers.map(({ customerId, name }) => ({ customerId, name }))
  } finally {
    // Step 5: Unmount the app after cancellation and latest-result publication.
    app.unmount()
    await nextTick()
  }

  // Step 6: Emit only the customers visible from the latest watcher run.
  console.log(JSON.stringify({ query: 'morgan lee', customers: visibleCustomers }))
}

if (import.meta.main) {
  await main()
}
