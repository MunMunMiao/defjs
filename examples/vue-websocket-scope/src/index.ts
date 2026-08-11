import {
  createClient,
  defineWebSocket,
  struct,
  type WebSocketIncomingData,
  type WebSocketSession,
  withEndpoint,
  withWebSocketHandle,
} from '@defjs/core'
import { createClientPlugin, injectClient } from '@defjs/vue'
import { defineComponent, nextTick, onScopeDispose, type PropType } from 'vue'
import { createWebSocketFixture } from './fixture'
import { createHostRoot, hostRenderer } from './renderer'

// Step 1: Type review decisions before scope callbacks can observe them.
const reviewDecisionMessages = {
  'review-decision': struct.object({ caseId: struct.string(), decision: struct.string() }),
}
export type ReviewDecision = WebSocketIncomingData<typeof reviewDecisionMessages>
type ReviewSession = WebSocketSession<ReviewDecision>
export const reviewDecisionSocket = defineWebSocket({
  maxIncomingQueueSize: 16,
  path: '/v1/fraud/reviews/review-73/decisions',
  incoming: reviewDecisionMessages,
})

// Step 2: Make the Vue scope own startup, receive callbacks, and awaited WebSocket closure.
export const ReviewDecisionScope = defineComponent({
  props: {
    onClosed: { type: Function as PropType<() => void>, required: true },
    onDecision: { type: Function as PropType<(decision: ReviewDecision) => void>, required: true },
    onError: { type: Function as PropType<(error: unknown) => void>, required: true },
  },
  setup(props) {
    const client = injectClient()
    const owner = new AbortController()
    let disposed = false
    let session: ReviewSession | undefined

    onScopeDispose(() => {
      disposed = true
      session?.close(1000, 'review scope closed')
      owner.abort()
    })

    async function receiveDecisions(): Promise<void> {
      const [error, opened] = await client.execute(reviewDecisionSocket(), { signal: owner.signal })
      if (error) throw error
      session = opened
      try {
        for await (const decision of opened.receive) {
          if (!disposed) props.onDecision(decision)
        }
      } finally {
        opened.close(1000, 'review decision receiver stopped')
        await opened.closed
      }
    }

    void receiveDecisions()
      .catch((error: unknown) => {
        if (!disposed) props.onError(error)
      })
      .finally(props.onClosed)
    return () => null
  },
})

export async function main(): Promise<void> {
  // Step 3: Create a controllable fraud socket and completion promises.
  const fixture = createWebSocketFixture()
  const closed = Promise.withResolvers<void>()
  const decision = Promise.withResolvers<ReviewDecision>()

  // Step 4: Mount the scope, open the socket, and deliver one typed decision.
  const root = createHostRoot()
  const app = hostRenderer.createApp(ReviewDecisionScope, {
    onClosed: closed.resolve,
    onDecision: decision.resolve,
    onError: decision.reject,
  })
  const client = createClient(withEndpoint('https://fraud.fixture.invalid'), withWebSocketHandle(fixture.WebSocket))
  app.use(createClientPlugin(client))
  app.mount(root)
  const socket = await fixture.connected
  try {
    socket.open()
    socket.message({ caseId: 'review-73', decision: 'hold', type: 'review-decision' })
    await decision.promise
  } finally {
    // Step 5: Unmount the app and await WebSocket closure.
    app.unmount()
    await nextTick()
    await closed.promise
  }

  // Step 6: Emit the decision observed while the scope was active.
  console.log(JSON.stringify(await decision.promise))
}

if (import.meta.main) {
  await main()
}
