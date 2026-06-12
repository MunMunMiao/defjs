import { createHttpInterceptor, defineRequest, struct } from '@defjs/core'
import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createApp } from 'vue'
import { getGlobalClient, injectClient, provideClient, provideGlobalClient, resetGlobalClient, withHost, withInterceptors } from './index'

const passthroughHttpInterceptor = () => createHttpInterceptor((req, next) => next(req))

describe('vue browser runtime', () => {
  let testServerHost: string

  beforeEach(() => {
    testServerHost = inject('testServerHost')
    resetGlobalClient()
  })

  afterEach(() => {
    resetGlobalClient()
  })

  test('should create a Plugin with provideClient', () => {
    const plugin = provideClient(withHost(testServerHost), withInterceptors(passthroughHttpInterceptor))
    expect(plugin).toHaveProperty('install')
    expect(typeof plugin.install).toBe('function')
  })

  test('should create a Plugin with provideGlobalClient', () => {
    const plugin = provideGlobalClient(withHost(testServerHost), withInterceptors(passthroughHttpInterceptor))
    expect(plugin).toHaveProperty('install')
    expect(typeof plugin.install).toBe('function')
  })

  test('should set global client with provideGlobalClient', () => {
    const app = createApp({ template: '<div></div>' })

    app.use(provideGlobalClient(withHost(testServerHost), withInterceptors(passthroughHttpInterceptor)))

    const globalClient = getGlobalClient()
    expect(globalClient).toBeDefined()
  })

  test('should provide client via app.provide', () => {
    let injectedClient: ReturnType<typeof injectClient> | undefined
    const app = createApp({
      setup() {
        injectedClient = injectClient()
        return {}
      },
      template: '<div></div>',
    })

    app.use(provideClient(withHost(testServerHost), withInterceptors(passthroughHttpInterceptor)))

    app.mount(document.createElement('div'))
    expect(injectedClient).toBeDefined()
  })

  test('should make HTTP requests with provided client', async () => {
    const app = createApp({ template: '<div></div>' })

    app.use(provideGlobalClient(withHost(testServerHost), withInterceptors(passthroughHttpInterceptor)))

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

    const [error, users] = await getUsers().with({ client: getGlobalClient() })

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
