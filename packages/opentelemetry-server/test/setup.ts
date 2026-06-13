import type { Socket } from 'node:net'
import type { ServerType } from '@hono/node-server'
import { createAdaptorServer } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    testServerHost: string
  }
}

let testServer: ServerType | undefined
const testServerSockets = new Set<Socket>()

export async function setup({ provide }: TestProject) {
  const app = new Hono()

  // HTTP: echo back received headers
  app.post('/echo-headers', async (c) => {
    const headers: Record<string, string> = {}
    c.req.raw.headers.forEach((value, key) => {
      headers[key] = value
    })
    return c.json({ headers })
  })

  // HTTP: return 500 for error testing
  app.get('/500', (c) => c.body(null, { status: 500, statusText: 'Internal Server Error' }))

  // SSE: echo back traceparent header, then close
  app.get('/sse', (c) => {
    const traceparent = c.req.header('traceparent') ?? 'missing'
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ data: traceparent, event: 'traceparent', id: '1' })
    })
  })

  // SSE: 500 error
  app.get('/sse/500', (c) => c.body(null, 500))

  // WebSocket: echo back traceparent query param, then close
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app, baseUrl: 'http://127.0.0.1' })

  app.get(
    '/ws',
    upgradeWebSocket((c) => {
      const traceparent = c.req.query('traceparent') ?? 'missing'
      return {
        onOpen(_event, ws) {
          ws.send(JSON.stringify({ type: 'traceparent', value: traceparent }))
          setTimeout(() => {
            if (ws.readyState === 1) {
              ws.close(1000, 'done')
            }
          }, 50)
        },
      }
    }),
  )

  const server = createAdaptorServer({ fetch: app.fetch, hostname: '127.0.0.1' })
  testServer = server

  server.on('connection', (socket) => {
    testServerSockets.add(socket)
    socket.on('close', () => {
      testServerSockets.delete(socket)
    })
  })

  injectWebSocket(server)

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new TypeError('Failed to resolve test server address')
  }

  const host = `http://127.0.0.1:${address.port}`
  server.unref()
  provide('testServerHost', host)
}

export async function teardown() {
  if (!testServer) {
    return
  }

  testServerSockets.forEach((socket) => socket.destroy())
  testServerSockets.clear()

  await new Promise<void>((resolve) => {
    testServer?.close(() => resolve())
  })

  testServer = undefined
}
