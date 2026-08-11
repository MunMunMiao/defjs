import { expectTypeOf } from 'vitest'
import type { Infer } from './index'

// @ts-expect-error TypeOf is intentionally not part of the public struct API.
import type { TypeOf } from './index'

// @ts-expect-error InputOf is intentionally not part of the public struct API.
import type { InputOf } from './index'

// @ts-expect-error JSON codec helpers are internal runtime behavior, not public struct API.
import type { encodeJson } from './index'

// @ts-expect-error JSON codec helpers are internal runtime behavior, not public struct API.
import type { decodeJson } from './index'

// @ts-expect-error FieldTag was removed with the public tag API.
import type { FieldTag } from './index'

// @ts-expect-error JsonTag was removed with the public tag API.
import type { JsonTag } from './index'

// @ts-expect-error TagNamespace was removed with the public tag API.
import type { TagNamespace } from './index'

// @ts-expect-error tag namespace is no longer part of the public struct API.
import { tag } from './index'

// @ts-expect-error createTagNamespace is no longer part of the public struct API.
import { createTagNamespace } from './index'

// @ts-expect-error getFieldTag is no longer part of the public struct API.
import { getFieldTag } from './index'

// @ts-expect-error getFieldTags is no longer part of the public struct API.
import { getFieldTags } from './index'

import { struct } from './index'

type IsAny<T> = 0 extends 1 & T ? true : false
type StrictEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? (IsAny<A> extends IsAny<B> ? true : false) : false
type Expect<T extends true> = T

const User = struct.object({
  id: struct.string(),
  name: struct.string().optional(),
})

type UserOutput = Infer<typeof User>
expectTypeOf<UserOutput>().toEqualTypeOf<{ id: string; name?: string }>()
expectTypeOf<(typeof User)['_struct']['input']>().toEqualTypeOf<{ id: string; name?: string }>()

const profile = struct.object({
  id: struct.string(),
  nickname: struct.string().optional(),
  score: struct.number(),
})

type ProfileCase = Expect<
  StrictEqual<
    Infer<typeof profile>,
    {
      id: string
      nickname?: string
      score: number
    }
  >
>

const dated = struct.date()
type DateCase = Expect<StrictEqual<Infer<typeof dated>, Date>>

const matrix = struct.array(struct.array(struct.object({ name: struct.string() })))

type MatrixCase = Expect<StrictEqual<Infer<typeof matrix>, { name: string }[][]>>

const tupleInputOutput = struct.tuple([struct.date(), struct.bigint(), struct.string().optional()])
expectTypeOf<(typeof tupleInputOutput)['_struct']['input']>().toEqualTypeOf<[Date | number | string, bigint | string, string | undefined]>()
expectTypeOf<Infer<typeof tupleInputOutput>>().toEqualTypeOf<[Date, bigint, string | undefined]>()

const result = struct.or(struct.string(), struct.number())

type UnionCase = Expect<StrictEqual<Infer<typeof result>, string | number>>
expectTypeOf<(typeof result)['_struct']['input']>().toEqualTypeOf<string | number>()

const modifierUnion = struct.or(struct.string().optional(), struct.number().null())
expectTypeOf<(typeof modifierUnion)['_struct']['input']>().toEqualTypeOf<string | number | null>()
expectTypeOf<Infer<typeof modifierUnion>>().toEqualTypeOf<string | number | null>()
type AnyGuard = Expect<StrictEqual<IsAny<Infer<typeof profile>>, false>>

const callable = () => 'value'
const AnyValue = struct.any()
const UnknownValue = struct.unknown()
const anyInput: (typeof AnyValue)['_struct']['input'] = callable
const unknownInput: (typeof UnknownValue)['_struct']['input'] = callable
// @ts-expect-error required any input excludes undefined.
const missingAnyInput: (typeof AnyValue)['_struct']['input'] = undefined
// @ts-expect-error required unknown input excludes null.
const nullUnknownInput: (typeof UnknownValue)['_struct']['input'] = null
void anyInput
void unknownInput
void missingAnyInput
void nullUnknownInput

const aliasedProfile = struct.object({
  displayName: struct.string().alias('display_name'),
})
type AliasOutputCase = Expect<StrictEqual<Infer<typeof aliasedProfile>, { displayName: string }>>

const merged = struct.intersection(
  struct.object({ id: struct.string() }),
  struct.object({ name: struct.string() }),
  struct.object({ active: struct.boolean() }),
)
const singleIntersection = struct.intersection(struct.object({ id: struct.string() }))

type IntersectionCase = Expect<StrictEqual<Infer<typeof merged>, { id: string } & { name: string } & { active: boolean }>>
type SingleIntersectionCase = Expect<StrictEqual<Infer<typeof singleIntersection>, { id: string }>>
expectTypeOf<(typeof merged)['_struct']['input']>().toEqualTypeOf<{ id: string } & { name: string } & { active: boolean }>()

const Event = struct.discriminatedUnion('type', [
  struct.object({ payload: struct.string(), type: struct.literal('message') }),
  struct.object({ count: struct.number(), type: struct.literal('count') }),
])
expectTypeOf<(typeof Event)['_struct']['input']>().toEqualTypeOf<{ payload: string; type: 'message' } | { count: number; type: 'count' }>()

// @ts-expect-error discriminated-union tags must be required.
struct.discriminatedUnion('type', [struct.object({ type: struct.literal('message').optional() })])
// @ts-expect-error discriminated-union tags cannot be nullable.
struct.discriminatedUnion('type', [struct.object({ type: struct.literal('message').null() })])

const NullEvent = struct.discriminatedUnion('type', [struct.object({ type: struct.literal(null), value: struct.string() })])
expectTypeOf<(typeof NullEvent)['_struct']['input']>().toEqualTypeOf<{ type: null; value: string }>()

// @ts-expect-error intersection requires at least one struct.
struct.intersection()

export type MissingTypeOf = TypeOf<never>
export type MissingInputOf = InputOf<never>
export type MissingEncodeJson = typeof encodeJson
export type MissingDecodeJson = typeof decodeJson
export type MissingFieldTag = FieldTag
export type MissingJsonTag = JsonTag
export type MissingTagNamespace = TagNamespace

void tag
void createTagNamespace
void getFieldTag
void getFieldTags

// @ts-expect-error primitive constraints were removed from the Go-style API.
struct.string().min(1)

// @ts-expect-error primitive constraints were removed from the Go-style API.
struct.number().int()

// @ts-expect-error primitive constraints were removed from the Go-style API.
struct.array(struct.string()).nonempty()

// @ts-expect-error transform was removed from the Go-style API.
struct.string().transform(
  (value: string) => Number(value),
  (value: number) => String(value),
)

// @ts-expect-error refine was removed from the Go-style API.
struct.string().refine((value: string) => value.length > 0)

// @ts-expect-error parse is internal runtime behavior, not public struct API.
struct.string().parse('x')

// @ts-expect-error key was removed; wire names must use alias().
const missingKeyMethod = struct.string().key
void missingKeyMethod

// @ts-expect-error async parsing is not part of the public struct API.
struct.string().parseAsync('x')

// @ts-expect-error request body requires a body wrapper or binary body struct.
struct.request({ body: struct.object({ id: struct.string() }) })

const JsonBody = struct.json(
  struct.object({
    displayName: struct.string().alias('display_name'),
    score: struct.number(),
  }),
)
type JsonBodyCase = Expect<StrictEqual<Infer<typeof JsonBody>, { displayName: string; score: number }>>
expectTypeOf<(typeof JsonBody)['_struct']['input']>().toEqualTypeOf<{ displayName: string; score: number }>()
expectTypeOf<(typeof JsonBody)['_struct']['output']>().toEqualTypeOf<{ displayName: string; score: number }>()

const OptionalInnerJsonBody = struct.json(struct.string().optional())
expectTypeOf<(typeof OptionalInnerJsonBody)['_struct']['input']>().toEqualTypeOf<string>()
expectTypeOf<(typeof OptionalInnerJsonBody)['_struct']['output']>().toEqualTypeOf<string>()
const OptionalJsonBody = OptionalInnerJsonBody.optional()
expectTypeOf<(typeof OptionalJsonBody)['_struct']['input']>().toEqualTypeOf<string | undefined>()

const RequestWithOptionalInnerBody = struct.request({ body: OptionalInnerJsonBody })
expectTypeOf<(typeof RequestWithOptionalInnerBody)['_struct']['input']>().toEqualTypeOf<{ body: string }>()

const RequestWithOptionalSections = struct.request({
  headers: struct.object({ traceId: struct.string().optional() }),
  path: struct.object({ locale: struct.string().optional() }),
  query: struct.object({ page: struct.number().optional() }),
})
expectTypeOf<(typeof RequestWithOptionalSections)['_struct']['input']>().toEqualTypeOf<{
  headers?: { traceId?: string }
  path?: { locale?: string }
  query?: { page?: number }
}>()
expectTypeOf<(typeof RequestWithOptionalSections)['_struct']['output']>().toEqualTypeOf<{
  headers: { traceId?: string }
  path: { locale?: string }
  query: { page?: number }
}>()
const omittedOptionalSections: (typeof RequestWithOptionalSections)['_struct']['input'] = {}
void omittedOptionalSections

const RequestWithMixedSection = struct.request({
  query: struct.object({ page: struct.number().optional(), q: struct.string() }),
})
// @ts-expect-error a request section with a required field cannot be omitted.
const omittedMixedSection: (typeof RequestWithMixedSection)['_struct']['input'] = {}
void omittedMixedSection

const RequestWithOptionalBodyFields = struct.request({
  body: struct.json(struct.object({ note: struct.string().optional() })),
})
// @ts-expect-error request bodies remain required even when every body field is optional.
const omittedOptionalBody: (typeof RequestWithOptionalBodyFields)['_struct']['input'] = {}
void omittedOptionalBody

const FormDataBody = struct.formData({
  file: struct.blob(),
  title: struct.string(),
})
type FormDataBodyCase = Expect<StrictEqual<Infer<typeof FormDataBody>, { file: Blob; title: string }>>
expectTypeOf<(typeof FormDataBody)['_struct']['input']>().toEqualTypeOf<{ file: Blob; title: string }>()
expectTypeOf<(typeof FormDataBody)['_struct']['output']>().toEqualTypeOf<{ file: Blob; title: string }>()

const UrlencodedBody = struct.urlencoded({
  page: struct.number(),
  q: struct.string(),
})
type UrlencodedBodyCase = Expect<StrictEqual<Infer<typeof UrlencodedBody>, { page: number; q: string }>>
expectTypeOf<(typeof UrlencodedBody)['_struct']['input']>().toEqualTypeOf<{ page: number; q: string }>()
expectTypeOf<(typeof UrlencodedBody)['_struct']['output']>().toEqualTypeOf<{ page: number; q: string }>()

const TextBody = struct.text()
type TextBodyCase = Expect<StrictEqual<Infer<typeof TextBody>, string>>
expectTypeOf<(typeof TextBody)['_struct']['input']>().toEqualTypeOf<string>()
expectTypeOf<(typeof TextBody)['_struct']['output']>().toEqualTypeOf<string>()

const RequestWithJsonBody = struct.request({ body: JsonBody })
expectTypeOf<(typeof RequestWithJsonBody)['_struct']['input']>().toEqualTypeOf<{
  body: { displayName: string; score: number }
}>()
expectTypeOf<(typeof RequestWithJsonBody)['_struct']['output']>().toEqualTypeOf<{
  body: { displayName: string; score: number }
}>()

// @ts-expect-error default was removed from the Go-style API.
struct.string().default('default-value')

// @ts-expect-error passthrough was removed from the Go-style API.
struct.object({ id: struct.string() }).passthrough()

// @ts-expect-error strip was removed from the Go-style API.
struct.object({ id: struct.string() }).strip()

// @ts-expect-error object shape utilities were removed from the Go-style API.
struct.object({ id: struct.string() }).pick({ id: true })

// @ts-expect-error struct.recursive was removed from the public API.
struct.recursive(() => struct.object({ id: struct.string() }))

export type Cases =
  | AliasOutputCase
  | AnyGuard
  | DateCase
  | FormDataBodyCase
  | IntersectionCase
  | JsonBodyCase
  | MatrixCase
  | ProfileCase
  | SingleIntersectionCase
  | TextBodyCase
  | UnionCase
  | UrlencodedBodyCase
