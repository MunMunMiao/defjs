import type { Socket } from 'node:net'
import type { ServerType } from '@hono/node-server'
import { createAdaptorServer } from '@hono/node-server'
import type { Hono } from 'hono'

export interface HonoTestServer {
  host: string
  close(): Promise<void>
}

export interface HonoTestServerOptions {
  injectWebSocket?: (server: ServerType) => void
}

export async function startHonoTestServer(app: Hono, options: HonoTestServerOptions = {}): Promise<HonoTestServer> {
  const sockets = new Set<Socket>()
  const server = createAdaptorServer({
    fetch: app.fetch,
    hostname: '127.0.0.1',
  })

  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => {
      sockets.delete(socket)
    })
  })

  options.injectWebSocket?.(server)

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new TypeError('Failed to resolve test server address')
  }

  server.unref()

  return {
    host: `http://127.0.0.1:${address.port}`,
    async close() {
      sockets.forEach((socket) => socket.destroy())
      sockets.clear()

      if (!server.listening) {
        return
      }

      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (!error || (error as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
            resolve()
            return
          }

          reject(error)
        })
      })
    },
  }
}
