import { describe, expect, test } from 'vitest'
import { makeResponse } from '../internal/http_response'
import { createDefinitionError, createHttpStatusError, createTransportError, ERR_ABORTED, ERR_TIMEOUT } from './index'

describe('error factory helpers', () => {
  function expectNativeError(error: Error, name: string, expectedKeys: string[], cause?: unknown): void {
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe(name)
    expect(String(error)).toBe(`${name}: ${error.message}`)
    expect(Object.getOwnPropertyDescriptor(error, 'name')).toEqual({
      configurable: true,
      enumerable: false,
      value: name,
      writable: true,
    })
    expect(Object.getOwnPropertyDescriptor(error, 'cause')).toEqual({
      configurable: true,
      enumerable: false,
      value: cause,
      writable: true,
    })
    expect(Object.keys(JSON.parse(JSON.stringify(error)))).toEqual(expectedKeys)
    expect(JSON.parse(JSON.stringify(error))).not.toHaveProperty('cause')
    expect(JSON.parse(JSON.stringify(error))).not.toHaveProperty('name')
  }

  test('should normalize transport errors', () => {
    const aborted = createTransportError(ERR_ABORTED)
    expect(aborted).toBeInstanceOf(Error)
    expect(aborted).toMatchObject({
      code: 'ABORTED',
      kind: 'transport',
      message: ERR_ABORTED.message,
    })
    const timedOut = createTransportError(ERR_TIMEOUT)
    expect(timedOut).toBeInstanceOf(Error)
    expect(timedOut).toMatchObject({
      code: 'TIMEOUT',
      kind: 'transport',
      message: ERR_TIMEOUT.message,
    })
    expect(createTransportError(new Error(ERR_TIMEOUT.message))).toMatchObject({
      code: 'NETWORK_ERROR',
      kind: 'transport',
      message: ERR_TIMEOUT.message,
    })
    const timeoutError = new Error('timed out')
    timeoutError.name = 'TimeoutError'
    expect(createTransportError(timeoutError)).toMatchObject({
      code: 'TIMEOUT',
      kind: 'transport',
      message: 'timed out',
    })
    expect(createTransportError(new DOMException('', 'TimeoutError'))).toMatchObject({
      code: 'TIMEOUT',
      kind: 'transport',
      message: ERR_TIMEOUT.message,
    })
    const offlineCause = new Error('offline')
    const offline = createTransportError(offlineCause)
    expect(offline).toBeInstanceOf(Error)
    expect(offline).toMatchObject({
      code: 'NETWORK_ERROR',
      kind: 'transport',
      message: 'offline',
    })

    expectNativeError(aborted, 'TransportError', ['code', 'kind'], ERR_ABORTED)
    expectNativeError(timedOut, 'TransportError', ['code', 'kind'], ERR_TIMEOUT)
    expectNativeError(offline, 'TransportError', ['code', 'kind'], offlineCause)
    expect(Object.prototype.propertyIsEnumerable.call(offline, 'code')).toBe(true)

    const nonErrorCause = createTransportError('offline')
    expect(nonErrorCause.message).toBe('Network error')
  })

  test('should create definition errors', () => {
    const undeclaredResponse = makeResponse({ status: 418, statusText: "I'm a teapot" })
    const undeclaredCause = new Error('missing status')
    const manualDefinitionError = createDefinitionError('UNDECLARED_STATUS', undeclaredCause, undeclaredResponse)
    expect(manualDefinitionError).toBeInstanceOf(Error)
    expect(manualDefinitionError).toMatchObject({
      code: 'UNDECLARED_STATUS',
      kind: 'definition',
      message: 'missing status',
      status: 418,
    })
    expect(manualDefinitionError.response).toBe(undeclaredResponse)

    const interceptorFailed = createDefinitionError('INTERCEPTOR_FAILED', new Error('interceptor boom'))
    expect(interceptorFailed).toBeInstanceOf(Error)
    expect(interceptorFailed).toMatchObject({
      code: 'INTERCEPTOR_FAILED',
      kind: 'definition',
      message: 'interceptor boom',
    })

    const nonErrorDefinitionCause = 'plain string cause'
    const nonErrorDefinition = createDefinitionError('REQUEST_VALIDATION_FAILED', nonErrorDefinitionCause)
    expect(nonErrorDefinition).toBeInstanceOf(Error)
    expect(nonErrorDefinition.message).toBe('plain string cause')
    expectNativeError(nonErrorDefinition, 'DefinitionError', ['code', 'kind'], nonErrorDefinitionCause)

    const definitionResponse = makeResponse({ body: { detail: 'response metadata' }, status: 400 })
    for (const code of ['REQUEST_VALIDATION_FAILED', 'RESPONSE_VALIDATION_FAILED', 'INTERCEPTOR_FAILED'] as const) {
      const cause = new Error(`${code} cause`)
      const error = createDefinitionError(code, cause, definitionResponse)
      expectNativeError(error, 'DefinitionError', ['code', 'kind', 'response'], cause)
      expect(Object.prototype.propertyIsEnumerable.call(error, 'code')).toBe(true)
    }
    expectNativeError(manualDefinitionError, 'DefinitionError', ['code', 'kind', 'response', 'status'], undeclaredCause)
  })

  test('should reject UNDECLARED_STATUS without a response', () => {
    expect(() => createDefinitionError('UNDECLARED_STATUS', new Error('missing'), undefined as never)).toThrow(TypeError)
  })

  test('should coerce non-Error UNDECLARED_STATUS causes', () => {
    const response = makeResponse({ status: 418, statusText: "I'm a teapot" })
    const error = createDefinitionError('UNDECLARED_STATUS', 'teapot', response)
    expect(error.message).toBe('teapot')
    expect(error.status).toBe(418)
  })

  test('should create http status errors as Error instances', () => {
    const response = makeResponse({ status: 404, statusText: 'Not Found' })
    const error = createHttpStatusError(404, 'Not found', response, { message: 'missing' })
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({
      code: 'HTTP_STATUS',
      data: { message: 'missing' },
      kind: 'http',
      message: 'Not found',
      status: 404,
    })
    expect(error.response).toBe(response)
    expect(error.name).toBe('HttpStatusError')
    expect(String(error)).toBe('HttpStatusError: Not found')
    expect(Object.getOwnPropertyDescriptor(error, 'name')).toEqual({
      configurable: true,
      enumerable: false,
      value: 'HttpStatusError',
      writable: true,
    })
    expect(Object.prototype.propertyIsEnumerable.call(error, 'code')).toBe(true)
    expect(Object.prototype.propertyIsEnumerable.call(error, 'cause')).toBe(false)
    expect(Object.keys(JSON.parse(JSON.stringify(error)))).toEqual(['code', 'data', 'kind', 'response', 'status'])
    expect(JSON.parse(JSON.stringify(error))).not.toHaveProperty('cause')
    expect(JSON.parse(JSON.stringify(error))).not.toHaveProperty('name')
  })
})
