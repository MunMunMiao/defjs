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
  })
})
