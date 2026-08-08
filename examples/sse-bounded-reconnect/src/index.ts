import { createClient, defineEventStream, struct, withEndpoint, withSSEHandle, withSSEReconnect } from '@defjs/core'

// Step 1: Type the route-status event carried across physical feed attempts.
export const routeStatusEvents = defineEventStream({
  path: '/v1/routes/:routeId/live-status',
  input: struct.request({ path: struct.object({ routeId: struct.string() }) }),
  events: {
    'route-status': struct.json(struct.object({ routeId: struct.string(), state: struct.string() })),
  },
})

// Step 2: Cap one logical route subscription at two reconnects with bounded delay growth.
function createRouteClient(handle: typeof fetch) {
  return createClient(
    withEndpoint('https://dispatch.invalid'),
    withSSEHandle(handle),
    withSSEReconnect({ attempts: 2, delayMs: 1, factor: 2, maxDelayMs: 2 }),
  )
}

// Step 3: Keep one iterator and close it after the first validated route state.
export async function waitForRouteState(client: ReturnType<typeof createRouteClient>, routeId: string): Promise<string> {
  const [error, stream] = await client.execute(routeStatusEvents({ path: { routeId } }))
  if (error) throw error

  try {
    for await (const event of stream) {
      switch (event.event) {
        case 'route-status':
          return event.data.state
      }
    }
    throw new Error('Route status stream ended before an update arrived')
  } finally {
    stream.close('route status received')
    await stream.closed
  }
}

export async function main(): Promise<void> {
  // Step 4: Fail two physical feeds before serving one route-status event.
  let requests = 0
  const fixtureFetch: typeof fetch = async () => {
    requests += 1
    if (requests < 3) {
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(new Error('dispatch feed disconnected'))
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    }
    return new Response('event: route-status\ndata: {"routeId":"route-17","state":"en-route"}\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    })
  }

  // Step 5: Wait for the route state across the bounded reconnect policy.
  const state = await waitForRouteState(createRouteClient(fixtureFetch), 'route-17')

  // Step 6: Emit the recovered state and three physical request count.
  console.log(JSON.stringify({ requests, state }))
}

if (import.meta.main) {
  await main()
}
