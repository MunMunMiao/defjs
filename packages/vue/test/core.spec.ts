import type { Client, ClientConfig, Interceptor } from '@defjs/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from 'vue'
import { injectClient, provideClient, withEndpoint, withInterceptors } from '../src'
import { startHonoServer } from './server'

type TestServer = { port: number; close: () => Promise<void> }

describe('withEndpoint', () => {
  it('should return a ClientOption function', () => {
    const option = withEndpoint('https://api.example.com')
    expect(typeof option).toBe('function')
  })

  it('should set endpoint in config', () => {
    const config = {} as ClientConfig
    const option = withEndpoint('https://api.example.com')
    option(config)
    expect(config.endpoint).toBe('https://api.example.com')
  })
})

describe('withInterceptors', () => {
  it('should return a ClientOption function', () => {
    const option = withInterceptors((() => ({})) as unknown as () => Interceptor)
    expect(typeof option).toBe('function')
  })

  it('should set interceptors in config', () => {
    const config = {} as ClientConfig
    const interceptor = (() => ({})) as unknown as () => Interceptor
    const option = withInterceptors(interceptor)
    option(config)
    expect(config.interceptors).toEqual([interceptor()])
  })
})

describe('injectClient', () => {
  it('should throw when no client is provided', () => {
    const app = createApp({
      setup() {
        return { client: injectClient() }
      },
      template: '<div></div>',
    })

    expect(() => app.mount(document.createElement('div'))).toThrow('No HTTP client provided')
  })
})

describe('provideClient', () => {
  let server: TestServer

  beforeAll(async () => {
    server = await startHonoServer()
  })

  afterAll(async () => {
    await server.close()
  })

  it('should create a Plugin', () => {
    const plugin = provideClient(
      withEndpoint(`http://localhost:${server.port}`),
      withInterceptors((() => ({})) as unknown as () => Interceptor),
    )
    expect(plugin).toHaveProperty('install')
  })

  it('should provide client via app.provide', async () => {
    let injectedClient: Client | undefined
    const app = createApp({
      setup() {
        injectedClient = injectClient()
        return { client: injectedClient }
      },
      template: '<div></div>',
    })

    app.use(provideClient(withEndpoint(`http://localhost:${server.port}`), withInterceptors((() => ({})) as unknown as () => Interceptor)))

    app.mount(document.createElement('div'))
    expect(injectedClient).toBeDefined()
  })

  it('should provide client configured with only host', async () => {
    let injectedClient: Client | undefined
    const app = createApp({
      setup() {
        injectedClient = injectClient()
        return { client: injectedClient }
      },
      template: '<div></div>',
    })

    app.use(provideClient(withEndpoint(`http://localhost:${server.port}`)))

    app.mount(document.createElement('div'))
    expect(injectedClient).toBeDefined()
  })

  it('should create a Plugin with only interceptors', () => {
    const plugin = provideClient(withInterceptors((() => ({})) as unknown as () => Interceptor))
    expect(plugin).toHaveProperty('install')
  })
  it('should provide client configured with only interceptors', async () => {
    let injectedClient: Client | undefined
    const app = createApp({
      setup() {
        injectedClient = injectClient()
        return { client: injectedClient }
      },
      template: '<div></div>',
    })

    app.use(provideClient(withInterceptors((() => ({})) as unknown as () => Interceptor)))

    app.mount(document.createElement('div'))
    expect(injectedClient).toBeDefined()
  })

  it('should provide client configured with no options', async () => {
    let injectedClient: Client | undefined
    const app = createApp({
      setup() {
        injectedClient = injectClient()
        return { client: injectedClient }
      },
      template: '<div></div>',
    })

    app.use(provideClient())

    app.mount(document.createElement('div'))
    expect(injectedClient).toBeDefined()
  })
})

