import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Define the settlement report accepted at the shared request boundary.
export const getSettlementReport = defineRequest({
  method: 'GET',
  path: '/settlements/:id',
  input: struct.request({ path: struct.object({ id: struct.string() }) }),
  output: [
    {
      status: 200,
      body: struct.object({ id: struct.string(), state: struct.literal('ready'), totalCents: struct.number() }),
    },
  ] as const,
})

export const SETTLEMENT_DEADLINE_MS = 25

// Step 2: Distinguish caller cancellation from the operation's fixed deadline in application results.
export async function readSettlementReport(client: Client, id: string, signal?: AbortSignal) {
  const [error, report] = await client.execute(getSettlementReport({ path: { id: encodeURIComponent(id) } }), {
    signal,
    timeout: SETTLEMENT_DEADLINE_MS,
  })
  if (error) {
    if (error.kind === 'transport' && error.code === 'TIMEOUT') return { kind: 'deadline_exceeded' as const }
    if (error.kind === 'transport' && error.code === 'ABORTED') return { kind: 'cancelled' as const }
    throw error
  }
  return { kind: 'ready' as const, report }
}

export async function main(): Promise<void> {
  // Step 3: Create an abort-aware slow report fixture with explicit timer cleanup.
  const callerRequestStarted = Promise.withResolvers<void>()
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const id = new URL(request.url).pathname.split('/').at(-1)
    if (id === 'caller-cancelled') callerRequestStarted.resolve()

    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        request.signal.removeEventListener('abort', onAbort)
        resolve(
          new Response(JSON.stringify({ id, state: 'ready', totalCents: 125_400 }), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          }),
        )
      }, 100)
      const onAbort = () => {
        clearTimeout(timer)
        request.signal.removeEventListener('abort', onAbort)
        reject(request.signal.reason)
      }
      if (request.signal.aborted) onAbort()
      else request.signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  // Step 4: Start one caller-owned request and one deadline-owned request.
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))
  const caller = new AbortController()
  const callerResult = readSettlementReport(client, 'caller-cancelled', caller.signal)

  try {
    await callerRequestStarted.promise
    caller.abort(new DOMException('settlement view closed', 'AbortError'))
    const callerCancellation = await callerResult
    const deadline = await readSettlementReport(client, 'provider-late')

    // Step 5: Emit the distinct caller-cancelled and deadline outcomes.
    console.log(JSON.stringify({ deadline, callerCancellation }))
  } finally {
    // Step 6: Abort and await any remaining caller-owned work before exit.
    caller.abort(new DOMException('settlement scenario closed', 'AbortError'))
    await callerResult
  }
}

if (import.meta.main) {
  await main()
}
