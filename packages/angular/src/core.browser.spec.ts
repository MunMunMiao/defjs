import '@angular/compiler'
import 'zone.js'
import 'zone.js/testing'

import { DOCUMENT } from '@angular/common'
import {
  Component,
  EnvironmentInjector,
  ViewContainerRef,
  createEnvironmentInjector,
  inject as injectAngular,
  runInInjectionContext,
} from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing'
import { createHttpInterceptor, defineRequest, getClientConfig, struct, type Client } from '@defjs/core'
import { afterEach, beforeAll, describe, expect, inject as injectVitest, it } from 'vitest'
import { injectClient, provideClient, withEndpoint, withInterceptors } from './index'

declare module 'vitest' {
  export interface ProvidedContext {
    testServerHost: string
  }
}

const getUsers = defineRequest({
  method: 'GET',
  path: '/api/users',
  output: {
    200: struct.array(
      struct.object({
        id: struct.number(),
        name: struct.string(),
      }),
    ),
  },
})

type Users = Array<{ id: number; name: string }>
type UsersResult = [unknown, unknown, unknown]

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting())
})

afterEach(() => {
  TestBed.resetTestingModule()
})

describe('Angular browser runtime', () => {
  it('should throw when injectClient is called without provider', async () => {
    @Component({
      standalone: true,
      template: '',
    })
    class LonelyConsumer {
      readonly client = injectClient()
    }

    await TestBed.configureTestingModule({
      imports: [LonelyConsumer],
    }).compileComponents()

    expect(() => TestBed.createComponent(LonelyConsumer)).toThrow(/HTTP_CLIENT|No provider/)
  })

  it('should share one client through multiple Angular component layers', async () => {
    const endpoint = injectVitest('testServerHost')
    let middleClient: Client | undefined
    let leafClient: Client | undefined

    @Component({
      standalone: true,
      selector: 'leaf-client-consumer',
      template: '',
    })
    class LeafClientConsumer {
      readonly client = injectClient()

      constructor() {
        leafClient = this.client
      }
    }

    @Component({
      standalone: true,
      selector: 'middle-client-consumer',
      imports: [LeafClientConsumer],
      template: '<leaf-client-consumer />',
    })
    class MiddleClientConsumer {
      readonly client = injectClient()

      constructor() {
        middleClient = this.client
      }
    }

    @Component({
      standalone: true,
      imports: [MiddleClientConsumer],
      template: '<middle-client-consumer />',
    })
    class RootClientProvider {}

    await TestBed.configureTestingModule({
      imports: [RootClientProvider],
      providers: [provideClient(withEndpoint(endpoint))],
    }).compileComponents()

    const fixture = TestBed.createComponent(RootClientProvider)
    fixture.detectChanges()

    expect(middleClient).toBeDefined()
    expect(leafClient).toBeDefined()
    expect(middleClient).toBe(leafClient)
  })

  it('should use the Angular DOCUMENT origin when no endpoint provider is configured', async () => {
    const endpoint = injectVitest('testServerHost')

    TestBed.configureTestingModule({
      providers: [
        {
          provide: DOCUMENT,
          useValue: {
            location: {
              origin: endpoint,
            },
          },
        },
        provideClient(),
      ],
    })

    const usersRequest = TestBed.runInInjectionContext(() => injectClient().execute(getUsers()) as Promise<UsersResult>)
    const [error, users] = await usersRequest

    expect(error).toBeNull()
    expect(users).toEqual([
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' },
    ] satisfies Users)
  })

  it('should use an empty endpoint when no endpoint provider or document origin is configured', () => {
    const injector = createEnvironmentInjector(
      [
        {
          provide: DOCUMENT,
          useValue: null,
        },
        provideClient(),
      ],
      TestBed.inject(EnvironmentInjector),
    )

    const endpoint = runInInjectionContext(injector, () => getClientConfig(injectClient()).endpoint)
    injector.destroy()

    expect(endpoint).toBe('')
  })

  it('should resolve the nearest Angular environment provider in nested component trees', async () => {
    const endpoint = injectVitest('testServerHost')
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

    @Component({
      standalone: true,
      selector: 'outer-request-consumer',
      template: '',
    })
    class OuterRequestConsumer {
      readonly client = injectClient()

      constructor() {
        outerClient = this.client
        outerRequest = this.client.execute(getUsers()) as Promise<UsersResult>
      }
    }

    @Component({
      standalone: true,
      selector: 'outer-sibling-consumer',
      template: '',
    })
    class OuterSiblingConsumer {
      readonly client = injectClient()

      constructor() {
        outerSiblingClient = this.client
      }
    }

    @Component({
      standalone: true,
      selector: 'inner-leaf-consumer',
      template: '',
    })
    class InnerLeafConsumer {
      readonly client = injectClient()

      constructor() {
        innerLeafClient = this.client
        innerRequest = this.client.execute(getUsers()) as Promise<UsersResult>
      }
    }

    @Component({
      standalone: true,
      selector: 'inner-middle-consumer',
      imports: [InnerLeafConsumer],
      template: '<inner-leaf-consumer />',
    })
    class InnerMiddleConsumer {
      readonly client = injectClient()

      constructor() {
        innerMiddleClient = this.client
      }
    }

    @Component({
      standalone: true,
      selector: 'inner-client-host',
      template: '',
    })
    class InnerClientHost {
      private readonly parentEnvironmentInjector = injectAngular(EnvironmentInjector)
      private readonly viewContainerRef = injectAngular(ViewContainerRef)
      private readonly childEnvironmentInjector = createEnvironmentInjector(
        [
          provideClient(
            withEndpoint(endpoint),
            withInterceptors(() => scopedInterceptor('inner')),
          ),
        ],
        this.parentEnvironmentInjector,
      )

      ngOnInit() {
        this.viewContainerRef.createComponent(InnerMiddleConsumer, {
          environmentInjector: this.childEnvironmentInjector,
        })
      }

      ngOnDestroy() {
        this.childEnvironmentInjector.destroy()
      }
    }

    @Component({
      standalone: true,
      imports: [OuterRequestConsumer, InnerClientHost, OuterSiblingConsumer],
      template: '<outer-request-consumer /><inner-client-host /><outer-sibling-consumer />',
    })
    class RootClientProvider {}

    await TestBed.configureTestingModule({
      imports: [RootClientProvider],
      providers: [
        provideClient(
          withEndpoint(endpoint),
          withInterceptors(() => scopedInterceptor('outer')),
        ),
      ],
    }).compileComponents()

    const fixture = TestBed.createComponent(RootClientProvider)
    fixture.detectChanges()

    if (!outerRequest || !innerRequest) {
      throw new Error('Expected nested client requests')
    }

    const [[outerError, outerUsers], [innerError, innerUsers]] = await Promise.all([outerRequest, innerRequest])

    expect(outerError).toBeNull()
    expect(outerUsers).toEqual([
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' },
    ] satisfies Users)
    expect(innerError).toBeNull()
    expect(innerUsers).toEqual([
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' },
    ] satisfies Users)
    expect(outerClient).toBeDefined()
    expect(outerSiblingClient).toBeDefined()
    expect(innerMiddleClient).toBeDefined()
    expect(innerLeafClient).toBeDefined()
    expect(outerClient).toBe(outerSiblingClient)
    expect(innerMiddleClient).toBe(innerLeafClient)
    expect(innerLeafClient).not.toBe(outerClient)
    expect([...seenScopes].sort()).toEqual(['inner', 'outer'])
  })
})
