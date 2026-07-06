import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { TestProject } from 'vitest/node'
import { startHonoTestServer, type HonoTestServer } from '../../../test/hono-test-server'

declare module 'vitest' {
  export interface ProvidedContext {
    testServerHost: string
  }
}

let testServer: HonoTestServer | undefined

export async function setup({ provide }: TestProject) {
  const app = new Hono()

  app.use(
    '*',
    cors({
      origin(origin) {
        return origin || '*'
      },
      allowHeaders: ['*', 'Accept', 'Content-Type', 'x-defjs-scope'],
      allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    }),
  )

  app.get('/api/users', (c) => {
    return c.json([
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' },
    ])
  })

  testServer = await startHonoTestServer(app)
  provide('testServerHost', testServer.host)
  console.log(`Test server is running on ${testServer.host}`)
}

export async function teardown() {
  await testServer?.close()
  testServer = undefined
}
