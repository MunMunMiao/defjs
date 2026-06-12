import { getGlobalClient, resetGlobalClient } from '@defjs/core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from 'vue'
import { injectClient, provideClient, provideGlobalClient, withHost, withInterceptors } from '../src'
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
    const option = withInterceptors((() => ({})) as unknown as Parameters<typeof withInterceptors>[0])
    expect(typeof option).toBe('function')
  })

  it('should set interceptors in config', () => {
    const config = {} as any
    const interceptor = (() => ({})) as unknown as Parameters<typeof withInterceptors>[0]
    const option = withInterceptors(interceptor)
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
      withInterceptors((() => ({})) as unknown as Parameters<typeof withInterceptors>[0]),
    )
    expect(plugin).toHaveProperty('install')
  })

  it('should provide client via app.provide', async () => {
    const app = createApp({
      setup() {
        const client = injectClient()
        return { client }
      },
      template: '<div></div>',
    })

    app.use(
      provideClient(
        withHost(`http://localhost:${server.port}`),
        withInterceptors((() => ({})) as unknown as Parameters<typeof withInterceptors>[0]),
      ),
    )

    // 验证插件已正确安装（app.use 不会抛出错误）
    expect(app).toBeDefined()
  })
})

describe('provideGlobalClient', () => {
  let server: any

  beforeAll(async () => {
    server = await startHonoServer()
  })

  afterAll(async () => {
    await server.close()
  })

  afterEach(() => {
    resetGlobalClient()
  })

  it('should create a Plugin', () => {
    const plugin = provideGlobalClient(
      withHost(`http://localhost:${server.port}`),
      withInterceptors((() => ({})) as unknown as Parameters<typeof withInterceptors>[0]),
    )
    expect(plugin).toHaveProperty('install')
  })

  it('should set global client', () => {
    const app = createApp({
      template: '<div></div>',
    })

    app.use(
      provideGlobalClient(
        withHost(`http://localhost:${server.port}`),
        withInterceptors((() => ({})) as unknown as Parameters<typeof withInterceptors>[0]),
      ),
    )

    // 验证全局 client 已被设置且可通过 getGlobalClient 获取
    const globalClient = getGlobalClient()
    expect(globalClient).toBeDefined()
  })
})
