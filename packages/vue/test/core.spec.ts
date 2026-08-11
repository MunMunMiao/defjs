import { createClient, type Client } from '@defjs/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, type App } from 'vue'
import { createClientPlugin, injectClient } from '../src'

describe('injectClient', () => {
  it('throws when no client is provided', () => {
    const app = createApp({
      setup() {
        injectClient()
        return () => h('div')
      },
    })
    app.config.warnHandler = () => {}

    expect(() => app.mount(document.createElement('div'))).toThrow('No HTTP client provided')
  })
})

describe('createClientPlugin', () => {
  const mountedApps: App[] = []

  afterEach(() => {
    for (const app of mountedApps.splice(0)) {
      app.unmount()
    }
  })

  it('provides the exact client instance supplied by the caller', () => {
    const client = createClient()
    let injectedClient: Client | undefined
    const app = createApp({
      setup() {
        injectedClient = injectClient()
        return () => h('div')
      },
    })

    const plugin = createClientPlugin(client)
    expect(plugin).toHaveProperty('install')
    app.use(plugin)
    app.mount(document.createElement('div'))
    mountedApps.push(app)

    expect(injectedClient).toBe(client)
  })
})
