import { createClient, createHttpInterceptor, defineRequest, struct, type Client } from '@defjs/core'
import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createApp, defineComponent, h, nextTick, provide, ref, type App, type Component } from 'vue'
import { HTTP_CLIENT, injectClient, provideClient, withEndpoint, withInterceptors } from './index'

const passthroughHttpInterceptor = () => createHttpInterceptor((req, next) => next(req))

const UserSchema = struct.object({
  id: struct.number(),
  name: struct.string(),
})

const getUsers = defineRequest({
  method: 'GET',
  output: {
    200: struct.array(UserSchema),
  },
  path: '/api/users',
})

type Users = Array<{ id: number; name: string }>
type UsersResult = [unknown, unknown, unknown]

const expectedUsers = [
  { id: 1, name: 'John' },
  { id: 2, name: 'Jane' },
] satisfies Users

const mountedApps: Array<() => void> = []

function mountRuntime(component: Component, configure?: (app: App) => void) {
  const root = document.createElement('div')
  document.body.appendChild(root)

  const app = createApp(component)
  configure?.(app)

  let mounted = false
  mountedApps.push(() => {
    if (mounted) {
      app.unmount()
    }

    root.remove()
  })

  app.mount(root)
  mounted = true

  return root
}

function renderedListItems(root: ParentNode) {
  return Array.from(root.querySelectorAll('li')).map((item) => item.textContent)
}

describe('vue browser runtime', () => {
  let testServerHost: string

  beforeEach(() => {
    testServerHost = inject('testServerHost')
  })

  afterEach(() => {
    for (const cleanup of mountedApps.splice(0).reverse()) {
      cleanup()
    }
  })

  test('returns a Vue plugin that installs a client provider', () => {
    const plugin = provideClient(withEndpoint(testServerHost), withInterceptors(passthroughHttpInterceptor))

    expect(plugin).toHaveProperty('install')
    expect(typeof plugin.install).toBe('function')
  })

  test('provides a client through the provideClient plugin', () => {
    let injectedClient: Client | undefined

    const Consumer = defineComponent({
      name: 'PluginClientConsumer',
      setup() {
        injectedClient = injectClient()
        return () => h('div')
      },
    })

    mountRuntime(Consumer, (app) => {
      app.use(provideClient(withEndpoint(testServerHost), withInterceptors(passthroughHttpInterceptor)))
    })

    expect(injectedClient).toBeDefined()
  })

  test('shares one client through multiple Vue component layers', () => {
    let middleClient: Client | undefined
    let leafClient: Client | undefined

    const Leaf = defineComponent({
      name: 'LeafClientConsumer',
      setup() {
        leafClient = injectClient()
        return () => h('span')
      },
    })

    const Middle = defineComponent({
      name: 'MiddleClientConsumer',
      setup() {
        middleClient = injectClient()
        return () => h(Leaf)
      },
    })

    mountRuntime(Middle, (app) => {
      app.use(provideClient(withEndpoint(testServerHost), withInterceptors(passthroughHttpInterceptor)))
    })

    expect(middleClient).toBeDefined()
    expect(leafClient).toBeDefined()
    expect(middleClient).toBe(leafClient)
  })

  test('renders data fetched by the injected client', async () => {
    let usersRequest: Promise<void> | undefined

    const UserList = defineComponent({
      name: 'InjectedClientUserList',
      setup() {
        const users = ref<Users>([])
        const errorMessage = ref('')
        const isLoading = ref(true)
        const client = injectClient()

        usersRequest = client.execute(getUsers()).then(([error, result]) => {
          isLoading.value = false

          if (error) {
            errorMessage.value = 'Failed to load users'
            return
          }

          users.value = result as Users
        })

        return () =>
          h('section', { 'aria-label': 'Users result' }, [
            isLoading.value ? h('p', 'Loading users') : null,
            errorMessage.value ? h('p', { role: 'alert' }, errorMessage.value) : null,
            users.value.length
              ? h(
                  'ul',
                  { 'aria-label': 'Users' },
                  users.value.map((user) => h('li', { key: user.id }, user.name)),
                )
              : null,
          ])
      },
    })

    const root = mountRuntime(UserList, (app) => {
      app.use(provideClient(withEndpoint(testServerHost), withInterceptors(passthroughHttpInterceptor)))
    })

    expect(root.textContent).toContain('Loading users')

    if (!usersRequest) {
      throw new Error('Expected user list request')
    }

    await usersRequest
    await nextTick()

    expect(renderedListItems(root)).toEqual(['John', 'Jane'])
    expect(root.querySelector('[role="alert"]')).toBeNull()
  })

  test('resolves the nearest Vue provider and renders scoped request results', async () => {
    const seenScopes: string[] = []
    let outerClient: Client | undefined
    let outerSiblingClient: Client | undefined
    let innerMiddleClient: Client | undefined
    let innerLeafClient: Client | undefined
    let outerRequest: Promise<UsersResult> | undefined
    let innerRequest: Promise<UsersResult> | undefined

    const scopedInterceptor = (scope: string) =>
      createHttpInterceptor(async (req, next) => {
        seenScopes.push(scope)
        req.headers?.set('x-defjs-scope', scope)
        return next(req)
      })

    const OuterRequestConsumer = defineComponent({
      name: 'OuterRequestConsumer',
      setup() {
        const userNames = ref('loading')

        outerClient = injectClient()
        outerRequest = (outerClient.execute(getUsers()) as Promise<UsersResult>).then((result) => {
          const [error, users] = result
          userNames.value = error ? 'error' : (users as Users).map((user) => user.name).join(', ')
          return result
        })

        return () => h('section', { 'data-scope': 'outer' }, `outer: ${userNames.value}`)
      },
    })

    const OuterSiblingConsumer = defineComponent({
      name: 'OuterSiblingConsumer',
      setup() {
        outerSiblingClient = injectClient()
        return () => h('span', { 'data-scope': 'outer-sibling' }, 'outer sibling ready')
      },
    })

    const InnerLeaf = defineComponent({
      name: 'InnerLeafConsumer',
      setup() {
        const userNames = ref('loading')

        innerLeafClient = injectClient()
        innerRequest = (innerLeafClient.execute(getUsers()) as Promise<UsersResult>).then((result) => {
          const [error, users] = result
          userNames.value = error ? 'error' : (users as Users).map((user) => user.name).join(', ')
          return result
        })

        return () => h('section', { 'data-scope': 'inner' }, `inner: ${userNames.value}`)
      },
    })

    const InnerMiddle = defineComponent({
      name: 'InnerMiddleConsumer',
      setup() {
        innerMiddleClient = injectClient()
        return () => h(InnerLeaf)
      },
    })

    const InnerProvider = defineComponent({
      name: 'InnerClientProvider',
      setup() {
        provide(
          HTTP_CLIENT,
          createClient(
            withEndpoint(testServerHost),
            withInterceptors(() => scopedInterceptor('inner')),
          ),
        )
        return () => h(InnerMiddle)
      },
    })

    const Root = defineComponent({
      name: 'RootClientProviderConsumer',
      setup() {
        return () => [h(OuterRequestConsumer), h(InnerProvider), h(OuterSiblingConsumer)]
      },
    })

    const root = mountRuntime(Root, (app) => {
      app.use(
        provideClient(
          withEndpoint(testServerHost),
          withInterceptors(() => scopedInterceptor('outer')),
        ),
      )
    })

    expect(root.querySelector('[data-scope="outer"]')?.textContent).toBe('outer: loading')
    expect(root.querySelector('[data-scope="inner"]')?.textContent).toBe('inner: loading')

    if (!outerRequest || !innerRequest) {
      throw new Error('Expected nested client requests')
    }

    const [[outerError, outerUsers], [innerError, innerUsers]] = await Promise.all([outerRequest, innerRequest])
    await nextTick()

    expect(root.querySelector('[data-scope="outer"]')?.textContent).toBe('outer: John, Jane')
    expect(root.querySelector('[data-scope="inner"]')?.textContent).toBe('inner: John, Jane')
    expect(root.querySelector('[data-scope="outer-sibling"]')?.textContent).toBe('outer sibling ready')
    expect(outerError).toBeNull()
    expect(outerUsers).toEqual(expectedUsers)
    expect(innerError).toBeNull()
    expect(innerUsers).toEqual(expectedUsers)
    expect(outerClient).toBeDefined()
    expect(outerSiblingClient).toBeDefined()
    expect(innerMiddleClient).toBeDefined()
    expect(innerLeafClient).toBeDefined()
    expect(outerClient).toBe(outerSiblingClient)
    expect(innerMiddleClient).toBe(innerLeafClient)
    expect(innerLeafClient).not.toBe(outerClient)
    expect([...seenScopes].sort()).toEqual(['inner', 'outer'])
  })

  test('provides a client with only endpoint', () => {
    let injectedClient: Client | undefined

    const Consumer = defineComponent({
      name: 'EndpointOnlyConsumer',
      setup() {
        injectedClient = injectClient()
        return () => h('div')
      },
    })

    mountRuntime(Consumer, (app) => {
      app.use(provideClient(withEndpoint(testServerHost)))
    })

    expect(injectedClient).toBeDefined()
  })

  test('provides a client with only interceptors', () => {
    let injectedClient: Client | undefined

    const Consumer = defineComponent({
      name: 'InterceptorsOnlyConsumer',
      setup() {
        injectedClient = injectClient()
        return () => h('div')
      },
    })

    mountRuntime(Consumer, (app) => {
      app.use(provideClient(withInterceptors(passthroughHttpInterceptor)))
    })

    expect(injectedClient).toBeDefined()
  })

  test('provides a client with no options', () => {
    let injectedClient: Client | undefined

    const Consumer = defineComponent({
      name: 'NoOptionsConsumer',
      setup() {
        injectedClient = injectClient()
        return () => h('div')
      },
    })

    mountRuntime(Consumer, (app) => {
      app.use(provideClient())
    })

    expect(injectedClient).toBeDefined()
  })

  test('creates injectable clients for each supported option shape', () => {
    const optionSets: Array<{ name: string; options: Parameters<typeof provideClient> }> = [
      { name: 'endpoint only', options: [withEndpoint(testServerHost)] },
      { name: 'interceptors only', options: [withInterceptors(passthroughHttpInterceptor)] },
      { name: 'no options', options: [] },
    ]

    for (const { name, options } of optionSets) {
      let injectedClient: Client | undefined

      const Consumer = defineComponent({
        name: `OptionShapeConsumer:${name}`,
        setup() {
          injectedClient = injectClient()
          return () => h('div', name)
        },
      })

      mountRuntime(Consumer, (app) => {
        app.use(provideClient(...options))
      })

      expect(injectedClient).toBeDefined()
    }
  })

  test('executes requests with a client configured by endpoint and interceptors', async () => {
    let injectedClient: Client | undefined

    const Consumer = defineComponent({
      name: 'ConfiguredClientConsumer',
      setup() {
        injectedClient = injectClient()
        return () => h('div')
      },
    })

    mountRuntime(Consumer, (app) => {
      app.use(provideClient(withEndpoint(testServerHost), withInterceptors(passthroughHttpInterceptor)))
    })

    if (!injectedClient) {
      throw new Error('Expected injected client')
    }

    const [error, users] = await injectedClient.execute(getUsers())

    expect(error).toBeNull()
    expect(users).toEqual(expectedUsers)
  })

  test('throws a helpful error when no provider is installed', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    const Consumer = defineComponent({
      name: 'MissingProviderConsumer',
      setup() {
        injectClient()
        return () => h('div')
      },
    })

    const app = createApp(Consumer)
    app.config.warnHandler = () => {}

    try {
      expect(() => app.mount(root)).toThrow('No HTTP client provided')
    } finally {
      root.remove()
    }
  })
})
