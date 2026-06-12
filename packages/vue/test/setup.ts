import type { Socket } from 'node:net'
import { createAdaptorServer, type ServerType } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
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

  app.use(
    '*',
    cors({
      origin(origin) {
        return origin || '*'
      },
      allowHeaders: ['*', 'Accept', 'Content-Type'],
      allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    }),
  )

  app.get('/api/users', c => {
    return c.json([
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' },
    ])
  })

  app.get('/api/users/:id', c => {
    const id = c.req.param('id')
    return c.json({ id: Number(id), name: 'John' })
  })

  const server = createAdaptorServer({
    fetch: app.fetch,
    hostname: '127.0.0.1',
  })
  testServer = server

  server.on('connection', socket => {
    testServerSockets.add(socket)
    socket.on('close', () => {
      testServerSockets.delete(socket)
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new TypeError('Failed to resolve test server address')
  }

  const testServerAddr = `http://127.0.0.1:${address.port}`
  server.unref()
  provide('testServerHost', testServerAddr)
  console.log(`Test server is running on ${testServerAddr}`)
}

export async function teardown() {
  if (!testServer) {
    return
  }

  if (!testServer.listening) {
    testServerSockets.clear()
    testServer = undefined
    return
  }

  testServerSockets.forEach(socket => {
    socket.destroy()
  })
  testServerSockets.clear()

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
