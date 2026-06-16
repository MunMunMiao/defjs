import { createHttpInterceptor, defineRequest, execute, struct, type Client } from '@defjs/core'
import { beforeEach, describe, expect, inject, test } from 'vitest'
import { createApp } from 'vue'
import { injectClient, provideClient, withEndpoint, withInterceptors } from './index'

const passthroughHttpInterceptor = () => createHttpInterceptor((req, next) => next(req))

describe('vue browser runtime', () => {
  let testServerHost: string

  beforeEach(() => {
    testServerHost = inject('testServerHost')
  })

  test('should create a Plugin with provideClient', () => {
    const plugin = provideClient(withEndpoint(testServerHost), withInterceptors(passthroughHttpInterceptor))
    expect(plugin).toHaveProperty('install')
    expect(typeof plugin.install).toBe('function')
  })

  test('should provide client via app.provide', () => {
    let injectedClient: Client | undefined
    const app = createApp({
      setup() {
        injectedClient = injectClient()
        return {}
      },
      template: '<div></div>',
    })

    app.use(provideClient(withEndpoint(testServerHost), withInterceptors(passthroughHttpInterceptor)))

    app.mount(document.createElement('div'))
    expect(injectedClient).toBeDefined()
  })

  test('should provide client with only host', () => {
    let injectedClient: Client | undefined
    const app = createApp({
      setup() {
        injectedClient = injectClient()
        return {}
      },
      template: '<div></div>',
    })

    app.use(provideClient(withEndpoint(testServerHost)))

    app.mount(document.createElement('div'))
    expect(injectedClient).toBeDefined()
  })

  test('should provide client with only interceptors', () => {
    let injectedClient: Client | undefined
    const app = createApp({
      setup() {
        injectedClient = injectClient()
        return {}
      },
      template: '<div></div>',
    })

    app.use(provideClient(withInterceptors(passthroughHttpInterceptor)))

    app.mount(document.createElement('div'))
    expect(injectedClient).toBeDefined()
  })

  test('should provide client with no options', () => {
    let injectedClient: Client | undefined
    const app = createApp({
      setup() {
        injectedClient = injectClient()
        return {}
      },
      template: '<div></div>',
    })

    app.use(provideClient())

    app.mount(document.createElement('div'))
    expect(injectedClient).toBeDefined()
  })

  test('should make HTTP requests with provided client', async () => {
    let injectedClient: Client | undefined

    const appOnlyHost = createApp({
      setup() {
        injectedClient = injectClient()
        return {}
      },
      template: '<div></div>',
    })
    appOnlyHost.use(provideClient(withEndpoint(testServerHost)))
    appOnlyHost.mount(document.createElement('div'))
    expect(injectedClient).toBeDefined()

    injectedClient = undefined

    const appOnlyInterceptors = createApp({
      setup() {
        injectedClient = injectClient()
        return {}
      },
      template: '<div></div>',
    })
    appOnlyInterceptors.use(provideClient(withInterceptors(passthroughHttpInterceptor)))
    appOnlyInterceptors.mount(document.createElement('div'))
    expect(injectedClient).toBeDefined()

    injectedClient = undefined

    const appNoOptions = createApp({
      setup() {
        injectedClient = injectClient()
        return {}
      },
      template: '<div></div>',
    })
    appNoOptions.use(provideClient())
    appNoOptions.mount(document.createElement('div'))
    expect(injectedClient).toBeDefined()
  })

  test('should make HTTP requests with provided client using both options', async () => {
    let injectedClient: Client | undefined
    const app = createApp({
      setup() {
        injectedClient = injectClient()
        return {}
      },
      template: '<div></div>',
    })

    app.use(provideClient(withEndpoint(testServerHost), withInterceptors(passthroughHttpInterceptor)))
    app.mount(document.createElement('div'))

    const getUsers = defineRequest({
      method: 'GET',
      output: {
        200: struct.array(
          struct.object({
            id: struct.number(),
            name: struct.string(),
          }),
        ),
      },
      path: '/api/users',
    })

    const [error, users] = await execute(getUsers(), { client: injectedClient! })

    expect(error).toBeNull()
    expect(users).toEqual([
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' },
    ])
  })

  test('should throw when injectClient is called without provider', () => {
    const app = createApp({
      setup() {
        return { client: injectClient() }
      },
      template: '<div></div>',
    })

    expect(() => app.mount(document.createElement('div'))).toThrow('No HTTP client provided')
  })
})
