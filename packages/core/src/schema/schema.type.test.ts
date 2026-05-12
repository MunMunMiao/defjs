import { type InputOf, schema, type TypeOf } from './index'

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

const profileSchema = schema.object({
  id: schema.string(),
  locale: schema.string().optional().default('zh-CN'),
  nickname: schema.string().optional(),
  score: schema.number(),
})

type ProfileCases = Expect<
  Equal<
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
  Equal<
    InputOf<typeof profileSchema>,
    {
      id: string
      locale?: string
      nickname?: string
      score: number
    }
  >
>

const requestSchema = schema.object({
  theme: schema.string().null(),
  timezone: schema.string().nullish(),
})

type RequestCases = Expect<
  Equal<
    TypeOf<typeof requestSchema>,
    {
      theme: string | null
      timezone?: string | null
    }
  >
>

type RequestInputCases = Expect<
  Equal<
    InputOf<typeof requestSchema>,
    {
      theme: string | null
      timezone?: string | null
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

type MatrixCases = Expect<Equal<TypeOf<typeof matrixSchema>, { name: string }[][][]>>

const treeSchema = schema.object({
  id: schema.string(),
  get children() {
    return schema.array(treeSchema)
  },
  meta: schema.object({
    get backups() {
      return schema.array(treeSchema)
    },
  }),
})

type TreeExpected = {
  children: TreeExpected[]
  id: string
  meta: {
    backups: TreeExpected[]
  }
}

type TreeCases = Expect<Equal<TypeOf<typeof treeSchema>, TreeExpected>>

const deepTreeSchema = schema.object({
  id: schema.string(),
  meta: schema.object({
    nested: schema.object({
      get snapshots() {
        return schema.array(schema.array(schema.array(deepTreeSchema)))
      },
    }),
  }),
})

type DeepTreeExpected = {
  id: string
  meta: {
    nested: {
      snapshots: DeepTreeExpected[][][]
    }
  }
}

type DeepTreeCases = Expect<Equal<TypeOf<typeof deepTreeSchema>, DeepTreeExpected>>

const uploadSchema = schema.object({
  attachment: schema.file(),
  body: schema.arrayBuffer(),
  cover: schema.blob(),
  metadata: schema.any(),
  raw: schema.unknown(),
})

type UploadCases = Expect<
  Equal<
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
type EnumCases = Expect<Equal<TypeOf<typeof enumSchema>, 'draft' | 'published'>>

const optionalSchema = schema.object({
  name: schema.string().optional(),
})

type OptionalCases = Expect<Equal<TypeOf<typeof optionalSchema>, { name?: string }>>

// @ts-expect-error optional key schema should not become a required undefined union
type OptionalShouldNotBecomeUndefinedUnion = Expect<Equal<TypeOf<typeof optionalSchema>, { name: string | undefined }>>

// @ts-expect-error array item must be a schema
schema.array(1)

export type Cases =
  | DeepTreeCases
  | EnumCases
  | MatrixCases
  | OptionalCases
  | ProfileCases
  | ProfileInputCases
  | RequestCases
  | RequestInputCases
  | TreeCases
  | UploadCases
