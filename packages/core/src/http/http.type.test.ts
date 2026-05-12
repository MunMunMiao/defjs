import { schema } from '../schema'
import { defineRequest } from './index'

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

const noInputEndpoint = defineRequest<undefined, undefined>({
  method: 'GET',
  path: '/health',
})

const requiredInputSchema = schema.object({
  id: schema.string(),
  verbose: schema.boolean().optional(),
})

const requiredSuccessSchema = schema.object({
  id: schema.string(),
})

const requiredErrorSchema = schema.object({
  message: schema.string(),
})

const requiredEndpoint = defineRequest<
  typeof requiredInputSchema,
  {
    200: typeof requiredSuccessSchema
    400: typeof requiredErrorSchema
  }
>({
  build(request, input) {
    request.pathParams({
      id: input.id,
    })
    request.queryParams({
      verbose: input.verbose,
    })
    request.json({
      id: input.id,
    })

    const id: string = input.id
    const verbose: boolean | undefined = input.verbose

    void id
    void verbose
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
            id?: string | undefined
            verbose?: boolean | undefined
          }
        | undefined
      )?,
    ]
  >
>

const requiredInput: Parameters<typeof requiredEndpoint>[0] = { id: 'user-1' }
const requiredRef = requiredEndpoint(requiredInput)

void noInputEndpoint()
void requiredRef

export type Cases = RequiredInputCases
