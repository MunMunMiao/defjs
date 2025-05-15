import { createApp, createRouter, defineEventHandler, eventHandler, getQuery, handleCors, readBody, toWebHandler } from 'h3'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    testServerHost: string
  }
}

let testServer: Bun.Server
let testServerAddr: string

export function setup({ provide }: TestProject) {
  const app = createApp()

  app.use(
    defineEventHandler(event => {
      handleCors(event, {
        origin: () => true,
        allowHeaders: ['Content-Type'],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        preflight: {
          statusCode: 204,
        },
      })
    }),
  )

  app.use(
    createRouter()
      .get(
        '/',
        eventHandler(() => new Response(undefined, { status: 200 })),
      )
      .post(
        '/',
        eventHandler(async event => await readBody(event)),
      )
      .get(
        '/text',
        eventHandler(() => new Response('Hello World!')),
      )
      .get(
        '/json',
        eventHandler(() => Response.json({ id: 1 })),
      )
      .get(
        '/null',
        eventHandler(() => new Response()),
      )
      .get(
        '/500',
        eventHandler(
          () =>
            new Response(undefined, {
              status: 500,
              statusText: 'Internal Server Error',
            }),
        ),
      )
      .head(
        '/head',
        eventHandler(
          () =>
            new Response(undefined, {
              status: 204,
              statusText: 'No Content',
            }),
        ),
      )
      .post(
        '/account',
        eventHandler(() => Response.json({ id: 1, name: 'Jack' })),
      )
      .get(
        '/delay',
        eventHandler(async req => {
          const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
          const { ms } = getQuery<{ ms: string }>(req)
          await delay(Number(ms))
          return new Response(undefined, { status: 200 })
        }),
      ),
  )

  testServer = Bun.serve({
    port: 3000,
    fetch: req => {
      const handler = toWebHandler(app)
      return handler(req)
    },
  })
  testServerAddr = `http://localhost:${testServer.port}`
  console.log(`Test server is running on ${testServerAddr}`)
}

export async function teardown() {
  await testServer.stop(true)
}
