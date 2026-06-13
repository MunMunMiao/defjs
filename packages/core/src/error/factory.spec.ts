import { describe, expect, test } from 'vitest'
import { createDefinitionError, createTransportError, ERR_ABORTED, ERR_TIMEOUT } from './index'

describe('error factory helpers', () => {
  test('should normalize transport errors', () => {
    expect(createTransportError(ERR_ABORTED)).toMatchObject({
      code: 'ABORTED',
      kind: 'transport',
      message: ERR_ABORTED.message,
    })
    expect(createTransportError(ERR_TIMEOUT)).toMatchObject({
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
    expect(createTransportError(new Error('offline'))).toMatchObject({
      code: 'NETWORK_ERROR',
      kind: 'transport',
      message: 'offline',
    })
  })

  test('should create definition errors', () => {
    const manualDefinitionError = createDefinitionError('UNDECLARED_STATUS', new Error('missing status'))
    expect(manualDefinitionError).toMatchObject({
      code: 'UNDECLARED_STATUS',
      kind: 'definition',
      message: 'missing status',
    })

    const nonErrorDefinition = createDefinitionError('REQUEST_VALIDATION_FAILED', 'plain string cause')
    expect(nonErrorDefinition.message).toBe('plain string cause')
  })
})
