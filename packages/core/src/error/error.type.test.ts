import type { DefinitionError, HttpStatusError, RequestError, TransportError } from './index'
import { createDefinitionError, createHttpStatusError, createTransportError } from './index'
import type { HttpResponse } from '../http'

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

const transportError = createTransportError(new Error('offline'))
type TransportCases = Expect<Equal<typeof transportError, TransportError>>

const definitionError = createDefinitionError('UNDECLARED_STATUS', new Error('missing status'))
type DefinitionCases = Expect<Equal<typeof definitionError, DefinitionError>>

declare const response: HttpResponse<unknown>
const httpStatusError = createHttpStatusError(404, 'Not found', response, { message: 'missing' })
type HttpStatusCases = Expect<Equal<typeof httpStatusError, HttpStatusError<{ message: string }, 404>>>
const compatibleHttpStatusError: HttpStatusError<{ message: string }> = httpStatusError
void compatibleHttpStatusError

function assertHttpData(requestError: RequestError<{ message: string }>): void {
  if (requestError.kind === 'http') {
    const data: {
      message: string
    } = requestError.data

    void data
  }
}

void assertHttpData

// @ts-expect-error invalid definition error code
createDefinitionError('INVALID_CODE', new Error('oops'))

export type Cases = DefinitionCases | HttpStatusCases | TransportCases
