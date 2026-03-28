import { createAdaptorServer, type ServerType } from '@hono/node-server'
import { createNodeWebSocket, type NodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { streamSSE } from 'hono/streaming'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    testServerHost: string
  }
}

let testServer: ServerType | undefined
let nodeWebSocket: NodeWebSocket | undefined
let testServerAddr: string

export async function setup({ provide }: TestProject) {
  const app = new Hono()
  const reconnectAttempts = new Map<string, number>()

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  function createSocketMessage(type: string, payload: unknown): string {
    if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
      return JSON.stringify({
        type,
        ...payload,
      })
    }

    return JSON.stringify({
      data: payload,
      type,
    })
  }

  app.use(
    '*',
    cors({
      origin(origin) {
        return origin || '*'
      },
      allowHeaders: ['*', 'Accept', 'Content-Type', 'Last-Event-ID'],
      allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
      exposeHeaders: ['x-request-id'],
      maxAge: 86_400,
    }),
  )

  app.get('/', c => c.body(null, 200))

  app.post('/', async c => {
    const contentType = c.req.header('content-type') ?? ''

    if (contentType.includes('application/json')) {
      return c.json(await c.req.json())
    }

    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('text/plain')) {
      return c.text(await c.req.text())
    }

    return c.body(await c.req.arrayBuffer(), {
      status: 200,
      headers: contentType ? { 'content-type': contentType } : undefined,
    })
  })

  app.get('/text', c => c.text('Hello World!'))
  app.get('/json', c => c.json({ id: 1 }))
  app.get('/null', c => c.body(null, 200))
  app.get('/500', c => c.body(null, { status: 500, statusText: 'Internal Server Error' }))
  app.on('HEAD', '/head', c => c.body(null, { status: 204, statusText: 'No Content' }))
  app.post('/account', c => c.json({ id: 1, name: 'Jack' }))
  app.get('/account/not-found', c => c.json({ code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' }, 404))

  app.get('/delay', async c => {
    await delay(Number(c.req.query('ms') ?? '0'))
    return c.body(null, 200)
  })

  app.get('/sse/basic', c => {
    c.header('x-request-id', 'trace-sse-basic')
    return streamSSE(c, async stream => {
      await stream.writeSSE({
        data: 'first',
        event: 'message',
        id: '1',
      })

      await stream.writeSSE({
        data: 'second line 1\nsecond line 2',
        event: 'message',
        id: '2',
      })
    })
  })

  app.get('/sse/retry', c => {
    const lastEventId = c.req.header('last-event-id')

    if (lastEventId === '1') {
      c.header('x-request-id', 'trace-sse-retry-2')
      return streamSSE(c, async stream => {
        await stream.writeSSE({
          data: 'second',
          event: 'message',
          id: '2',
        })
      })
    }

    c.header('x-request-id', 'trace-sse-retry-1')
    return streamSSE(c, async stream => {
      await stream.writeSSE({
        data: 'first',
        event: 'message',
        id: '1',
        retry: 0,
      })
    })
  })

  app.get('/sse/infinite', c => {
    c.header('x-request-id', 'trace-sse-infinite')
    return streamSSE(c, async stream => {
      let count = 0

      const writeTick = async () => {
        count += 1
        await stream.writeSSE({
          data: String(count),
          event: 'tick',
          id: String(count),
        })
      }

      await writeTick()

      await new Promise<void>(resolve => {
        const interval = setInterval(() => {
          if (stream.aborted) {
            clearInterval(interval)
            resolve()
            return
          }

          void writeTick()
        }, 20)

        stream.onAbort(() => {
          clearInterval(interval)
          resolve()
        })
      })
    })
  })

  const { injectWebSocket, upgradeWebSocket, wss } = createNodeWebSocket({
    app,
    baseUrl: 'http://127.0.0.1',
  })
  nodeWebSocket = { injectWebSocket, upgradeWebSocket, wss }

  app.get(
    '/ws/basic',
    upgradeWebSocket(c => {
      const roomId = c.req.query('roomId') ?? 'default'

      return {
        onOpen(_event, ws) {
          ws.send(createSocketMessage('joined', { roomId, userId: 1 }))
          setTimeout(() => {
            if (ws.readyState === 1) {
              ws.send(createSocketMessage('message', { text: `welcome:${roomId}`, userId: 1 }))
              ws.close(1000, 'done')
            }
          }, 10)
        },
      }
    }),
  )

  app.get(
    '/ws/echo',
    upgradeWebSocket(() => ({
      onOpen(_event, ws) {
        ws.send(createSocketMessage('ready', { ok: true }))
      },
      onMessage(event, ws) {
        ws.send(typeof event.data === 'string' ? event.data : JSON.stringify(event.data))
      },
    })),
  )

  app.get(
    '/ws/invalid',
    upgradeWebSocket(() => ({
      onOpen(_event, ws) {
        setTimeout(() => {
          if (ws.readyState === 1) {
            ws.send('not-json')
            ws.close(1000, 'done')
          }
        }, 10)
      },
    })),
  )

  app.get(
    '/ws/before-connect',
    upgradeWebSocket(c => {
      const token = c.req.query('token') ?? 'missing'

      return {
        onOpen(_event, ws) {
          ws.send(createSocketMessage('connected', { token }))
          setTimeout(() => {
            if (ws.readyState === 1) {
              ws.close(1000, 'done')
            }
          }, 10)
        },
      }
    }),
  )

  app.get(
    '/ws/reconnect',
    upgradeWebSocket(c => {
      const key = c.req.query('key') ?? 'default'
      const attempt = (reconnectAttempts.get(key) ?? 0) + 1
      reconnectAttempts.set(key, attempt)

      return {
        onOpen(_event, ws) {
          if (attempt === 1) {
            setTimeout(() => {
              if (ws.readyState === 1) {
                ws.close(1012, 'restart')
              }
            }, 25)
            return
          }

          ws.send(createSocketMessage('reconnected', { attempt }))
        },
        onMessage(event, ws) {
          ws.send(typeof event.data === 'string' ? event.data : JSON.stringify(event.data))
        },
      }
    }),
  )

  app.get(
    '/ws/heartbeat',
    upgradeWebSocket(() => ({
      onMessage(event, ws) {
        try {
          const decoded = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data)) as { type?: string }
          if (decoded.type === 'ping') {
            ws.send(createSocketMessage('pong', { ok: true }))
            ws.close(1000, 'heartbeat-ok')
          }
        } catch {
          // noop
        }
      },
    })),
  )

  const server = createAdaptorServer({
    fetch: app.fetch,
    hostname: '127.0.0.1',
  })
  testServer = server

  injectWebSocket(server)

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new TypeError('Failed to resolve test server address')
  }

  testServerAddr = `http://127.0.0.1:${address.port}`
  provide('testServerHost', testServerAddr)
  console.log(`Test server is running on ${testServerAddr}`)
}

export async function teardown() {
  if (nodeWebSocket) {
    nodeWebSocket.wss.clients.forEach(client => {
      client.terminate()
    })

    await new Promise<void>((resolve, reject) => {
      nodeWebSocket?.wss.close(error => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })

    nodeWebSocket = undefined
  }

  if (!testServer) {
    return
  }

  if (!testServer.listening) {
    testServer = undefined
    return
  }

  await new Promise<void>((resolve, reject) => {
    testServer?.close(error => {
      if (error) {
        if ((error as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
          resolve()
          return
        }

        reject(error)
        return
      }

      resolve()
    })
  })

  testServer = undefined
}
