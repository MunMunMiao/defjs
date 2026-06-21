import { describe, expectTypeOf, it } from 'vitest'
import { StructError, struct, type ErrorMap, type Infer, type StructIssue } from './index'

// @ts-expect-error ObjectShape is internal.
import type { ObjectShape } from './index'

// @ts-expect-error RequestShape is internal.
import type { RequestShape } from './index'

// @ts-expect-error RequestBodyCodec is internal.
import type { RequestBodyCodec } from './index'

describe('struct public API', () => {
  it('exports struct, Infer, and error types', () => {
    const User = struct.object({ id: struct.string() })

    expectTypeOf<Infer<typeof User>>().toEqualTypeOf<{ id: string }>()
    expectTypeOf(StructError).toBeConstructibleWith([] as StructIssue[])
    expectTypeOf<ErrorMap>().toBeFunction()
  })
})

export type MissingObjectShape = ObjectShape
export type MissingRequestShape = RequestShape
export type MissingRequestBodyCodec = RequestBodyCodec
