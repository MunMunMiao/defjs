import 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    testServerHost: string
  }
}

export {}
