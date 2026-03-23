import { createServer, type Server } from 'node:http'
import { createApp, createRouter, defineEventHandler, eventHandler, getQuery, handleCors, readBody } from 'h3'
import { toNodeListener } from 'h3/node'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    testServerHost: string
  }
}

let testServer: Server | undefined
let testServerAddr: string

export async function setup({ provide }: TestProject) {
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

  testServer = createServer(toNodeListener(app))
  await new Promise<void>((resolve, reject) => {
    testServer?.once('error', reject)
    testServer?.listen(0, '127.0.0.1', () => resolve())
  })

  const address = testServer.address()
  if (!address || typeof address === 'string') {
    throw new TypeError('Failed to resolve test server address')
  }

  testServerAddr = `http://127.0.0.1:${address.port}`
  provide('testServerHost', testServerAddr)
  console.log(`Test server is running on ${testServerAddr}`)
}

export async function teardown() {
  if (!testServer) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    testServer?.close(error => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}
