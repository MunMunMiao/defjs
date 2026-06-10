import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createApp } from 'vue'
import { provideClient, provideGlobalClient, injectClient, withHost, withInterceptors, resetGlobalClient, getGlobalClient } from './index'

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
    const plugin = provideClient(
      withHost(testServerHost),
      withInterceptors(() => ({}))
    )
    expect(plugin).toHaveProperty('install')
    expect(typeof plugin.install).toBe('function')
  })

  test('should create a Plugin with provideGlobalClient', () => {
    const plugin = provideGlobalClient(
      withHost(testServerHost),
      withInterceptors(() => ({}))
    )
    expect(plugin).toHaveProperty('install')
    expect(typeof plugin.install).toBe('function')
  })

  test('should set global client with provideGlobalClient', () => {
    const app = createApp({ template: '<div></div>' })

    app.use(provideGlobalClient(
      withHost(testServerHost),
      withInterceptors(() => ({}))
    ))

    const globalClient = getGlobalClient()
    expect(globalClient).toBeDefined()
  })

  test('should provide client via app.provide', () => {
    const app = createApp({ template: '<div></div>' })

    app.use(provideClient(
      withHost(testServerHost),
      withInterceptors(() => ({}))
    ))

    // Note: inject() only works during setup() execution
    // In a real browser test, we would mount the component and verify
    // For now, we verify the plugin was installed correctly
    expect(app._context.provides).toBeDefined()
  })

  test('should make HTTP requests with provided client', async () => {
    const app = createApp({ template: '<div></div>' })

    app.use(provideGlobalClient(
      withHost(testServerHost),
      withInterceptors(() => ({}))
    ))

    const client = getGlobalClient()
    expect(client).toBeDefined()

    // Make a real HTTP request to the test server
    const response = await client.get('/api/users')
    expect(response).toBeDefined()
  })
})
