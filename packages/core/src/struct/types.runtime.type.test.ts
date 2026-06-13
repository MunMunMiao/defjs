import type { Infer } from './index'

// @ts-expect-error TypeOf is intentionally not part of the public struct API.
import type { TypeOf } from './index'

// @ts-expect-error InputOf is intentionally not part of the public struct API.
import type { InputOf } from './index'

// @ts-expect-error JSON codec helpers are internal runtime behavior, not public struct API.
import type { encodeJson } from './index'

// @ts-expect-error JSON codec helpers are internal runtime behavior, not public struct API.
import type { decodeJson } from './index'
import { struct } from './index'

type IsAny<T> = 0 extends 1 & T ? true : false
type StrictEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? (IsAny<A> extends IsAny<B> ? true : false) : false
type Expect<T extends true> = T

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

const result = struct.or(struct.string(), struct.number())

type UnionCase = Expect<StrictEqual<Infer<typeof result>, string | number>>
type AnyGuard = Expect<StrictEqual<IsAny<Infer<typeof profile>>, false>>

export type MissingTypeOf = TypeOf<never>
export type MissingInputOf = InputOf<never>
export type MissingEncodeJson = typeof encodeJson
export type MissingDecodeJson = typeof decodeJson

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

// @ts-expect-error key was removed; Go-style wire names must use tag.*().
const missingKeyMethod = struct.string().key
void missingKeyMethod

// @ts-expect-error async parsing is not part of the public struct API.
struct.string().parseAsync('x')

// @ts-expect-error request body requires a body wrapper or binary body struct.
struct.request({ body: struct.object({ id: struct.string() }) })

// @ts-expect-error default was removed from the Go-style API.
struct.string().default('fallback')

// @ts-expect-error passthrough was removed from the Go-style API.
struct.object({ id: struct.string() }).passthrough()

// @ts-expect-error strip was removed from the Go-style API.
struct.object({ id: struct.string() }).strip()

// @ts-expect-error object shape utilities were removed from the Go-style API.
struct.object({ id: struct.string() }).pick({ id: true })

// @ts-expect-error struct.recursive was removed from the public API.
struct.recursive(() => struct.object({ id: struct.string() }))

export type Cases = AnyGuard | DateCase | MatrixCase | ProfileCase | UnionCase
