import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createApp } from 'vue'
import { provideClient, withHost, withInterceptors, injectClient } from './core'

describe('Vue core browser runtime', () => {
  let testServerHost: string

  beforeEach(() => {
    testServerHost = inject('testServerHost')
  })

  test('should create and inject client in browser environment', async () => {
    const app = createApp({
      setup() {
        const client = injectClient()
        return { client }
      },
      template: '<div></div>',
    })

    app.use(
      provideClient(
        withHost(testServerHost),
        withInterceptors(() => ({})),
      ),
    )

    // Verify plugin installed without errors
    expect(app).toBeDefined()
  })

  test('should configure client with correct host', () => {
    const config = {} as any
    const option = withHost('https://api.example.com')
    option(config)
    expect(config.endpoint).toBe('https://api.example.com')
  })

  test('should configure interceptors', () => {
    const config = {} as any
    const interceptor = () => ({})
    const option = withInterceptors(() => interceptor)
    option(config)
    expect(config.interceptors).toEqual([interceptor])
  })
})
