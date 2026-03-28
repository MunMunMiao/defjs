import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, restGlobalClient, setGlobalClient } from './client'
import { defineRequest } from './index'
import { __makeResponse } from './response'
import { type StandardSchemaLike, schema } from './schema'

describe('request http runtime compatibility', () => {
  beforeEach(() => {
    setGlobalClient(
      createClient({
        endpoint: inject('testServerHost'),
      }),
    )
  })

  afterEach(() => {
    restGlobalClient()
  })

  test('should support Standard Schema compatible input and output', async () => {
    let parsedInputId: number | undefined

    const standardInput: StandardSchemaLike<{ id: string }, { id: number }> = {
      '~standard': {
        validate(value) {
          if (typeof value !== 'object' || value === null || typeof (value as { id?: unknown }).id !== 'string') {
            return {
              issues: [{ message: 'id must be a string' }],
            }
          }

          return {
            value: { id: Number((value as { id: string }).id) },
          }
        },
      },
    }

    const standardOutput: StandardSchemaLike<unknown, { ok: boolean; parsedId: number }> = {
      '~standard': {
        validate(value) {
          if (
            typeof value !== 'object' ||
            value === null ||
            typeof (value as { ok?: unknown }).ok !== 'boolean' ||
            typeof (value as { parsedId?: unknown }).parsedId !== 'number'
          ) {
            return {
              issues: [{ message: 'invalid output' }],
            }
          }

          return {
            value: value as { ok: boolean; parsedId: number },
          }
        },
      },
    }

    setGlobalClient(
      createClient({
        endpoint: 'https://example.com',
        http: {
          handler: async request =>
            __makeResponse({
              body: {
                ok: true,
                parsedId: Number(request.queryParams?.get('id')),
              },
              status: 200,
            }),
        },
      }),
    )

    const useStandardSchema = defineRequest({
      build: (request, input) => {
        parsedInputId = input.id
        request.queryParams({
          id: input.id,
        })
      },
      input: standardInput,
      method: 'GET',
      output: {
        200: standardOutput,
      },
      path: '/standard',
    }).use

    const [error, result] = await useStandardSchema({ id: '42' })

    expect(error).toBeNull()
    expect(parsedInputId).toBe(42)
    expect(result).toEqual({
      ok: true,
      parsedId: 42,
    })
  })

  test('should support standard schemas with explicit responseType declarations', async () => {
    const client = createClient({
      endpoint: 'https://example.com',
      http: {
        handler: async ({ endpoint }) => {
          switch (endpoint) {
            case '/json-text':
              return __makeResponse({
                body: { id: 1 },
                headers: new Headers([['content-type', 'application/json']]),
                status: 200,
              })
            case '/plain-text':
              return __makeResponse({
                body: 'zen-kit',
                headers: new Headers([['content-type', 'text/plain']]),
                status: 200,
              })
            default:
              return __makeResponse({
                body: null,
                status: 404,
              })
          }
        },
      },
    })

    const useJsonResponse = defineRequest({
      method: 'GET',
      output: {
        200: schema.object({
          id: schema.number(),
        }),
      },
      responseType: 'json',
      path: '/json-text',
    }).use

    const useTextResponse = defineRequest({
      method: 'GET',
      output: {
        200: schema.string(),
      },
      responseType: 'text',
      path: '/plain-text',
    }).use

    const [[jsonError, jsonResult], [textError, textResult]] = await Promise.all([
      useJsonResponse()({ client }),
      useTextResponse()({ client }),
    ])

    expect(jsonError).toBeNull()
    expect(jsonResult).toEqual({ id: 1 })
    expect(textError).toBeNull()
    expect(textResult).toBe('zen-kit')
  })
})
