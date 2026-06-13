import type { DefinitionError, RequestError, TransportError } from './index'
import { createDefinitionError, createRequestRuntimeError, createTransportError } from './index'

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

const transportError = createTransportError(new Error('offline'))
type TransportCases = Expect<Equal<typeof transportError, TransportError>>

const definitionError = createDefinitionError('UNDECLARED_STATUS', new Error('missing status'))
type DefinitionCases = Expect<Equal<typeof definitionError, DefinitionError>>

const runtimeError = createRequestRuntimeError(new Error('offline'))
type RuntimeCases = Expect<Equal<typeof runtimeError, RequestError<unknown>>>

declare const requestError: RequestError<{ message: string }>

if (requestError.kind === 'http') {
  const data: {
    message: string
  } = requestError.data

  void data
}

// @ts-expect-error invalid definition error code
createDefinitionError('INVALID_CODE', new Error('oops'))

export type Cases = DefinitionCases | RuntimeCases | TransportCases
