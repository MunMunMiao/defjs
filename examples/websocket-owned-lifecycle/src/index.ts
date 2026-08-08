import {
  createClient,
  defineWebSocket,
  struct,
  type Client,
  type WebSocketIncomingData,
  withEndpoint,
  withWebSocketHandle,
} from '@defjs/core'
import { createOwnedLifecycleFixture } from './fixture'

// Step 1: Type case-status updates before an owner callback can consume them.
const caseStatusMessages = {
  'case-status': struct.object({ caseId: struct.string(), status: struct.string() }),
}
export type CaseStatus = WebSocketIncomingData<typeof caseStatusMessages>
export const caseStatusUpdates = defineWebSocket({
  path: '/v1/support/case-status',
  incoming: caseStatusMessages,
})

// Step 2: Share one abort owner across startup and iteration, then always close and await the session.
export async function consumeCaseStatus(client: Client, signal: AbortSignal, consume: (status: CaseStatus) => void | Promise<void>) {
  const [error, session] = await client.execute(caseStatusUpdates(), { signal })
  if (error) throw error

  try {
    for await (const status of session.receive) await consume(status)
  } finally {
    session.close(1000, 'case-status owner disposed')
    await session.closed
  }
  return session.state
}

export async function main(): Promise<void> {
  // Step 3: Open one local support socket and enqueue a typed case update.
  const WebSocketImpl = createOwnedLifecycleFixture((socket) => {
    socket.open()
    queueMicrotask(() => socket.message({ caseId: 'case-842', status: 'assigned', type: 'case-status' }))
  })

  // Step 4: Create the client and owner for the logical session.
  const client = createClient(withEndpoint('https://support.invalid'), withWebSocketHandle(WebSocketImpl))
  const owner = new AbortController()
  let status: CaseStatus | undefined

  // Step 5: Consume the update, abort its owner, and await operation cleanup.
  const terminal = await consumeCaseStatus(client, owner.signal, (next) => {
    status = next
    owner.abort(new DOMException('case status received', 'AbortError'))
  })

  // Step 6: Emit the received status and terminal aborted state.
  console.log(JSON.stringify({ status, terminal }))
}

if (import.meta.main) {
  await main()
}
