import { describe, expect, test } from 'vitest'
import { makeResponse, toSettledResponse } from '../internal/http_response'
import { SchemaError } from '../schema'
import { createDefinitionError, createRequestRuntimeError, createTransportError, ERR_ABORTED, ERR_TIMEOUT, unwrapErrorCause } from './index'

describe('error factory helpers', () => {
  test('should normalize transport errors', () => {
    expect(createTransportError(ERR_ABORTED)).toMatchObject({
      code: 'ABORTED',
      kind: 'transport',
      message: ERR_ABORTED.message,
    })
    expect(createTransportError(new Error(ERR_TIMEOUT.message))).toMatchObject({
      code: 'TIMEOUT',
      kind: 'transport',
      message: ERR_TIMEOUT.message,
    })
    expect(createTransportError(new Error('offline'))).toMatchObject({
      code: 'NETWORK_ERROR',
      kind: 'transport',
      message: 'offline',
    })
  })

  test('should create definition and runtime errors', () => {
    const badResponse = toSettledResponse(
      makeResponse({
        body: {
          message: 'bad request',
        },
        error: new Error('HTTP 400'),
        status: 400,
        url: 'https://api.example.com/users',
      }),
    )
    const httpError = createRequestRuntimeError(new Error('ignored'), badResponse)
    expect(httpError).toMatchObject({
      kind: 'http',
      status: 400,
      message: 'HTTP 400',
    })

    const schemaError = new SchemaError([
      {
        code: 'custom',
        expected: 'string',
        message: 'name invalid',
        path: ['name'],
        received: 1,
      },
    ])
    const definitionError = createRequestRuntimeError(schemaError)
    expect(definitionError).toMatchObject({
      code: 'RESPONSE_VALIDATION_FAILED',
      kind: 'definition',
    })

    const wrapped = new Error('outer', {
      cause: new Error('inner', {
        cause: schemaError,
      }),
    })
    expect(unwrapErrorCause(wrapped)).toBe(schemaError)

    const manualDefinitionError = createDefinitionError('UNDECLARED_STATUS', new Error('missing status'))
    expect(manualDefinitionError).toMatchObject({
      code: 'UNDECLARED_STATUS',
      kind: 'definition',
      message: 'missing status',
    })

    // Cover line 66: cause is not an Error
    const nonErrorDefinition = createDefinitionError('REQUEST_VALIDATION_FAILED', 'plain string cause')
    expect(nonErrorDefinition.message).toBe('plain string cause')

    // Cover line 83: response.error is not an Error
    const stringErrorResponse = toSettledResponse(
      makeResponse({
        body: null,
        error: 'string error',
        status: 500,
      }),
    )
    const httpStringError = createRequestRuntimeError(new Error('ignored'), stringErrorResponse)
    expect(httpStringError).toMatchObject({
      kind: 'http',
      message: 'string error',
      status: 500,
    })

    // Cover line 83: response.error is falsy (?? fallback)
    const nullErrorResponse = {
      body: null,
      error: null,
      headers: new Headers(),
      ok: false,
      status: 500,
      statusText: '',
      url: '',
    }
    const httpNullError = createRequestRuntimeError(new Error('ignored'), nullErrorResponse)
    expect(httpNullError).toMatchObject({
      kind: 'http',
      message: 'HTTP 500',
      status: 500,
    })
  })
})
