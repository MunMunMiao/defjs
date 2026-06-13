import { struct } from '../struct'
import type { UseRequestConfig } from './index'
import { defineRequest } from './index'

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

const noInputEndpoint = defineRequest<undefined, undefined>({
  method: 'GET',
  path: '/health',
})

const requiredInputSchema = struct.request({
  body: struct.json(
    struct.object({
      id: struct.string(),
    }),
  ),
  path: struct.object({
    id: struct.string(),
  }),
  query: struct.object({
    verbose: struct.boolean().optional(),
  }),
})

const requiredSuccessSchema = struct.object({
  id: struct.string(),
})

const requiredErrorSchema = struct.object({
  message: struct.string(),
})

const requiredEndpoint = defineRequest<
  typeof requiredInputSchema,
  {
    200: typeof requiredSuccessSchema
    400: typeof requiredErrorSchema
  }
>({
  build(request, input) {
    request.setPathParams({
      id: input.path.id,
    })
    request.setQueryParams({
      verbose: input.query.verbose,
    })
    request.setJson({
      id: input.body.id,
    })

    // @ts-expect-error schema build context only exposes bindXXX orchestration helpers.
    request.json({ id: input.body.id })

    // @ts-expect-error bind values must come from the bound input view, not literal runtime data.
    request.setJson({ id: 'user-1' })

    // @ts-expect-error flat bindings also require bound struct fields as values.
    request.setQueryParams({ verbose: true })

    // @ts-expect-error build input is a bound view, not the parsed string value.
    const id: string = input.path.id
    void id
  },
  input: requiredInputSchema,
  method: 'POST',
  output: {
    200: requiredSuccessSchema,
    400: requiredErrorSchema,
  },
  path: '/users/:id',
})

type RequiredInputCases = Expect<
  Equal<
    Parameters<typeof requiredEndpoint>,
    [
      (
        | {
            body?: {
              id?: string | undefined
            }
            path?: {
              id?: string | undefined
            }
            query?: {
              verbose?: boolean | undefined
            }
          }
        | undefined
      )?,
    ]
  >
>

const requiredInput: Parameters<typeof requiredEndpoint>[0] = { body: { id: 'user-1' }, path: { id: 'user-1' } }
const requiredRef = requiredEndpoint(requiredInput)

requiredRef.with({ timeout: 100 })
requiredRef.with({ abort: new AbortController().signal })
requiredRef.with({ abort: AbortSignal.timeout(100) })

const requestTimeoutConfig = { timeout: 100 } satisfies UseRequestConfig
const requestAbortConfig = { abort: new AbortController().signal } satisfies UseRequestConfig
void requestTimeoutConfig
void requestAbortConfig

// @ts-expect-error with.abort and with.timeout are mutually exclusive.
requiredRef.with({ abort: new AbortController().signal, timeout: 100 })

// @ts-expect-error abort must be an AbortSignal.
requiredRef.with({ abort: true })

// @ts-expect-error abort must be an AbortSignal, not an AbortController.
requiredRef.with({ abort: new AbortController() })

requiredRef.with({
  // @ts-expect-error abort must be an AbortSignal, not a callback.
  abort: () => {
    void 0
  },
})

const arrayInputSchema = struct.request({
  body: struct.json(
    struct.object({
      users: struct.array(
        struct.object({
          id: struct.number(),
          name: struct.string(),
        }),
      ),
    }),
  ),
})

const arrayEndpoint = defineRequest({
  build(request, input) {
    request.setJson({
      users: input.body.users.map((user) => ({
        id: user.id,
      })),
    })

    // @ts-expect-error ArrayProjection only supports map().
    input.body.users.filter((user) => user.id)
  },
  input: arrayInputSchema,
  method: 'POST',
  path: '/users',
})

const flatProjectionInputSchema = struct.request({
  body: struct.json(
    struct.object({
      avatar: struct.blob(),
      profile: struct.object({
        name: struct.string(),
      }),
    }),
  ),
})

const flatProjectionEndpoint = defineRequest({
  build(request, input) {
    // @ts-expect-error flat bindings reject object-shaped bound fields.
    request.setQueryParams({ profile: input.body.profile })

    // @ts-expect-error formData also rejects nested object bound fields.
    request.setFormData({ profile: input.body.profile })

    request.setFormData({ avatar: input.body.avatar })
  },
  input: flatProjectionInputSchema,
  method: 'POST',
  path: '/upload',
})

void noInputEndpoint()
void requiredRef
void arrayEndpoint
void flatProjectionEndpoint

export type Cases = RequiredInputCases
