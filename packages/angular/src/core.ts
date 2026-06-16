import { DOCUMENT } from '@angular/common'
import type { EnvironmentProviders } from '@angular/core'
import { InjectionToken, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core'
import type { Client, Interceptor } from '@defjs/core'
import { createClient, setGlobalClient, withInterceptors as withClientInterceptors, withEndpoint as withCoreEndpoint } from '@defjs/core'

const HTTP_CLIENT = new InjectionToken<Client>('HTTP_CLIENT')
const HTTP_INTERCEPTOR_FNS = new InjectionToken<Interceptor[]>('HTTP_INTERCEPTOR_FNS')
const HTTP_ENDPOINT = new InjectionToken<string>('HTTP_ENDPOINT')

export function withEndpoint(endpoint: string): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: HTTP_ENDPOINT,
      useValue: endpoint,
    },
  ])
}

export function withInterceptors(...fns: (() => Interceptor)[]): EnvironmentProviders {
  return makeEnvironmentProviders(
    fns.map(fn => ({
      provide: HTTP_INTERCEPTOR_FNS,
      useFactory: fn,
      multi: true,
    })),
  )
}

export function provideClient(...feature: EnvironmentProviders[]): EnvironmentProviders {
  return makeEnvironmentProviders([
    ...feature,
    {
      provide: HTTP_CLIENT,
      useFactory: () => {
        let endpoint = inject(HTTP_ENDPOINT, { optional: true })

        if (!endpoint) {
          const document: Document | null = inject(DOCUMENT, { optional: true })

          endpoint = document?.location.origin ?? ''
        }

        const interceptors = inject(HTTP_INTERCEPTOR_FNS, { optional: true }) ?? []

        return createClient(withCoreEndpoint(endpoint), withClientInterceptors(...interceptors))
      },
    },
  ])
}

export function provideGlobalClient(...feature: EnvironmentProviders[]): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideClient(...feature),
    provideAppInitializer(() => {
      const client = inject(HTTP_CLIENT)

      setGlobalClient(client)
    }),
  ])
}

export function injectClient(): Client {
  return inject(HTTP_CLIENT)
}
