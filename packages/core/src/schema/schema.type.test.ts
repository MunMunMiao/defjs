import { type InputOf, schema, type TypeOf } from './index'
import type { ArraySchema, ObjectSchema, Schema, SchemaLike } from './schema'

type IsAny<T> = 0 extends 1 & T ? true : false
type StrictEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? (IsAny<A> extends IsAny<B> ? true : false) : false
type Expect<T extends true> = T

const profileSchema = schema.object({
  id: schema.string(),
  locale: schema.string().optional().default('zh-CN'),
  nickname: schema.string().optional(),
  score: schema.number(),
})

type ProfileCases = Expect<
  StrictEqual<
    TypeOf<typeof profileSchema>,
    {
      id: string
      locale: string
      nickname?: string
      score: number
    }
  >
>

type ProfileInputCases = Expect<
  StrictEqual<
    InputOf<typeof profileSchema>,
    {
      id?: string | undefined
      locale?: string | undefined
      nickname?: string | undefined
      score?: number | undefined
    }
  >
>

const requestSchema = schema.object({
  theme: schema.string().null(),
  timezone: schema.string().nullish(),
})

type RequestCases = Expect<
  StrictEqual<
    TypeOf<typeof requestSchema>,
    {
      theme: string | null
      timezone?: string | null
    }
  >
>

type RequestInputCases = Expect<
  StrictEqual<
    InputOf<typeof requestSchema>,
    {
      theme?: string | null | undefined
      timezone?: string | null | undefined
    }
  >
>

const matrixSchema = schema.array(
  schema.array(
    schema.array(
      schema.object({
        name: schema.string(),
      }),
    ),
  ),
)

type MatrixCases = Expect<StrictEqual<TypeOf<typeof matrixSchema>, { name: string }[][][]>>

type TreeExpected = {
  children: TreeExpected[]
  id: string
  meta: {
    backups: TreeExpected[]
  }
}

type TreeShape = {
  id: Schema<string | undefined, string, false>
  children: ArraySchema<SchemaLike<TreeExpected, TreeExpected, false>>
  meta: ObjectSchema<{
    backups: ArraySchema<SchemaLike<TreeExpected, TreeExpected, false>>
  }>
}

const treeSchema = schema.object({
  id: schema.string(),
  get children() {
    return schema.array(treeSchema) as unknown as ArraySchema<SchemaLike<TreeExpected, TreeExpected, false>>
  },
  meta: schema.object({
    get backups() {
      return schema.array(treeSchema) as unknown as ArraySchema<SchemaLike<TreeExpected, TreeExpected, false>>
    },
  }),
}) as unknown as ObjectSchema<TreeShape>

type TreeCases = Expect<StrictEqual<TypeOf<typeof treeSchema>, TreeExpected>>

type DeepTreeExpected = {
  id: string
  meta: {
    nested: {
      snapshots: DeepTreeExpected[][][]
    }
  }
}

type DeepTreeShape = {
  id: Schema<string | undefined, string, false>
  meta: ObjectSchema<{
    nested: ObjectSchema<{
      snapshots: ArraySchema<ArraySchema<ArraySchema<SchemaLike<DeepTreeExpected, DeepTreeExpected, false>>>>
    }>
  }>
}

const deepTreeSchema = schema.object({
  id: schema.string(),
  meta: schema.object({
    nested: schema.object({
      get snapshots() {
        return schema.array(schema.array(schema.array(deepTreeSchema))) as unknown as ArraySchema<
          ArraySchema<ArraySchema<SchemaLike<DeepTreeExpected, DeepTreeExpected, false>>>
        >
      },
    }),
  }),
}) as unknown as ObjectSchema<DeepTreeShape>

type DeepTreeCases = Expect<StrictEqual<TypeOf<typeof deepTreeSchema>, DeepTreeExpected>>

const uploadSchema = schema.object({
  attachment: schema.file(),
  body: schema.arrayBuffer(),
  cover: schema.blob(),
  metadata: schema.any(),
  raw: schema.unknown(),
})

type UploadCases = Expect<
  StrictEqual<
    TypeOf<typeof uploadSchema>,
    {
      attachment: File
      body: ArrayBuffer
      cover: Blob
      metadata: any
      raw: unknown
    }
  >
>

const enumSchema = schema.enum({ Draft: 'draft', Published: 'published' } as const)
type EnumCases = Expect<StrictEqual<TypeOf<typeof enumSchema>, 'draft' | 'published'>>

const optionalSchema = schema.object({
  name: schema.string().optional(),
})

type OptionalCases = Expect<StrictEqual<TypeOf<typeof optionalSchema>, { name?: string }>>

// @ts-expect-error optional key schema should not become a required undefined union
type OptionalShouldNotBecomeUndefinedUnion = Expect<StrictEqual<TypeOf<typeof optionalSchema>, { name: string | undefined }>>

// @ts-expect-error any-poisoned inference should fail strict equality
type AnyPollutionGuard = Expect<StrictEqual<TypeOf<ReturnType<typeof schema.string>>, any>>

// @ts-expect-error parse on string schema must reject non-string Output
type ParseReturnsString = Expect<StrictEqual<TypeOf<ReturnType<typeof schema.string>>, number>>

// @ts-expect-error array item must be a schema
schema.array(1)

export type Cases =
  | AnyPollutionGuard
  | DeepTreeCases
  | EnumCases
  | MatrixCases
  | OptionalCases
  | OptionalShouldNotBecomeUndefinedUnion
  | ParseReturnsString
  | ProfileCases
  | ProfileInputCases
  | RequestCases
  | RequestInputCases
  | TreeCases
  | UploadCases
