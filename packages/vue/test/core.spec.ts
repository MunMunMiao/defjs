import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp, inject } from 'vue'
import { withHost, withInterceptors, provideClient, injectClient, HTTP_CLIENT } from '../src'
import { startHonoServer } from './server'

describe('withHost', () => {
  it('should return a ClientOption function', () => {
    const option = withHost('https://api.example.com')
    expect(typeof option).toBe('function')
  })

  it('should set endpoint in config', () => {
    const config = {} as any
    const option = withHost('https://api.example.com')
    option(config)
    expect(config.endpoint).toBe('https://api.example.com')
  })
})

describe('withInterceptors', () => {
  it('should return a ClientOption function', () => {
    const option = withInterceptors(() => ({}))
    expect(typeof option).toBe('function')
  })

  it('should set interceptors in config', () => {
    const config = {} as any
    const interceptor = () => ({})
    const option = withInterceptors(() => interceptor)
    option(config)
    expect(config.interceptors).toEqual([interceptor])
  })
})

describe('provideClient', () => {
  let server: any

  beforeAll(async () => {
    server = await startHonoServer()
  })

  afterAll(async () => {
    await server.close()
  })

  it('should create a Plugin', () => {
    const plugin = provideClient(
      withHost(`http://localhost:${server.port}`),
      withInterceptors(() => ({}))
    )
    expect(plugin).toHaveProperty('install')
  })

  it('should provide client via app.provide', async () => {
    const app = createApp({
      setup() {
        const client = injectClient()
        return { client }
      },
      template: '<div></div>'
    })

    app.use(provideClient(
      withHost(`http://localhost:${server.port}`),
      withInterceptors(() => ({}))
    ))

    // 测试 client 已被提供
  })
})
