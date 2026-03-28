import {
  createClient,
  defineEventStream,
  defineRequest,
  defineWebSocket,
  restGlobalClient,
  schema,
  setGlobalClient,
} from '../../dist/index.js'

const host =
  (typeof process !== 'undefined' && process?.env?.DEFJS_TEST_SERVER_HOST) ||
  (typeof Deno !== 'undefined' && Deno?.env?.get?.('DEFJS_TEST_SERVER_HOST')) ||
  undefined

if (!host) {
  throw new Error('Missing DEFJS_TEST_SERVER_HOST')
}

setGlobalClient(
  createClient({
    endpoint: host,
  }),
)

try {
  const [httpError, httpResult, httpResponse] = await defineRequest({
    method: 'GET',
    output: {
      200: schema.object({
        id: schema.number(),
      }),
    },
    path: '/json',
  }).use()

  const [sseError, stream, open] = await defineEventStream({
    events: {
      message: schema.string(),
    },
    path: '/sse/basic',
  }).use()

  const sseEvents = []
  if (stream) {
    for await (const event of stream) {
      sseEvents.push(event.data)
    }
  }

  const [wsError, socket, connection] = await defineWebSocket({
    incoming: {
      message: schema.object({
        text: schema.string(),
      }),
      ready: schema.object({
        ok: schema.boolean(),
      }),
    },
    outgoing: {
      message: schema.object({
        text: schema.string(),
      }),
    },
    path: '/ws/echo',
  }).use()({
    protocols: ['json'],
  })

  let wsReady = null
  let wsEcho = null
  if (socket) {
    const iterator = socket.receive[Symbol.asyncIterator]()
    wsReady = await iterator.next()
    socket.send({
      text: 'compat',
      type: 'message',
    })
    wsEcho = await iterator.next()
    socket.close(1000, 'done')
    await socket.closed
  }

  console.log(
    JSON.stringify({
      http: {
        error: httpError,
        ok: httpResponse?.ok ?? false,
        result: httpResult,
      },
      sse: {
        error: sseError,
        events: sseEvents,
        ok: open?.response?.ok ?? false,
      },
      ws: {
        connection,
        echo: wsEcho,
        error: wsError,
        ready: wsReady,
      },
    }),
  )
} finally {
  restGlobalClient()
}
