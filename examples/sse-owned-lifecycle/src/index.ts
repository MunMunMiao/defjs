import { createClient, defineEventStream, struct, type Infer, withEndpoint, withSSEHandle, withSSEReconnect } from '@defjs/core'

// Step 1: Type case assignments before callbacks can receive them from the non-reconnecting feed.
const caseAssignmentStruct = struct.object({ caseId: struct.string(), queue: struct.string() })
export type CaseAssignment = Infer<typeof caseAssignmentStruct>
export const caseAssignmentEvents = defineEventStream({
  maxBufferSize: 1024,
  maxQueueSize: 8,
  path: '/v1/support/case-assignments',
  events: {
    'case-assigned': struct.json(caseAssignmentStruct),
  },
})
function createCaseAssignmentClient(handle: typeof fetch) {
  return createClient(withEndpoint('https://support.invalid'), withSSEHandle(handle), withSSEReconnect({ attempts: 0 }))
}

// Step 2: Bind the owner signal, callback, listener removal, and terminal stream state to one operation.
export async function consumeCaseAssignments(
  client: ReturnType<typeof createCaseAssignmentClient>,
  signal: AbortSignal,
  consume: (assignment: CaseAssignment) => void | Promise<void>,
) {
  const [error, stream] = await client.execute(caseAssignmentEvents(), { signal })
  if (error) throw error

  const closeOnAbort = () => stream.close(signal.reason)
  if (signal.aborted) closeOnAbort()
  else signal.addEventListener('abort', closeOnAbort, { once: true })

  try {
    for await (const event of stream) {
      switch (event.event) {
        case 'case-assigned':
          await consume(event.data)
          break
      }
    }
  } finally {
    signal.removeEventListener('abort', closeOnAbort)
    stream.close('case assignment owner disposed')
    await stream.closed
  }
  return await stream.closed
}

export async function main(): Promise<void> {
  // Step 3: Serve one assignment from a stream that otherwise remains open.
  const encoder = new TextEncoder()
  const fixtureFetch: typeof fetch = async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('event: case-assigned\ndata: {"caseId":"case-842","queue":"billing"}\n\n'))
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    )

  // Step 4: Create the owner that controls the subscription signal.
  const owner = new AbortController()
  let assignment: CaseAssignment | undefined

  // Step 5: Consume one assignment, abort its owner, and await terminal closure.
  const close = await consumeCaseAssignments(createCaseAssignmentClient(fixtureFetch), owner.signal, (next) => {
    assignment = next
    owner.abort(new DOMException('assignment received', 'AbortError'))
  })

  // Step 6: Emit the assignment and aborted stream state.
  console.log(JSON.stringify({ assignment, terminal: close.code }))
}

if (import.meta.main) {
  await main()
}
