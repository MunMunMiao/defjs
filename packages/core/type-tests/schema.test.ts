import { schema, type TypeOf } from '../src/schema'

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

const profileSchema = schema.object({
  id: schema.string(),
  nickname: schema.string().optional(),
  locale: schema.string().optional().default('zh-CN'),
  score: schema.number(),
})

type Profile = TypeOf<typeof profileSchema>
type ProfileExpected = {
  id: string
  locale: string
  nickname?: string
  score: number
}

type ProfileCases = Expect<Equal<Profile, ProfileExpected>>

const requestSchema = schema.object({
  timezone: schema.string().nullish(),
  theme: schema.string().null(),
})

type Request = TypeOf<typeof requestSchema>
type RequestExpected = {
  theme: string | null
  timezone?: string | null
}

type RequestCases = Expect<Equal<Request, RequestExpected>>

const matrixSchema = schema.array(
  schema.array(
    schema.array(
      schema.object({
        name: schema.string(),
      }),
    ),
  ),
)

type Matrix = TypeOf<typeof matrixSchema>
type MatrixCases = Expect<Equal<Matrix, { name: string }[][][]>>

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

type Tree = TypeOf<typeof treeSchema>
type TreeExpected = {
  children: TreeExpected[]
  id: string
  meta: {
    backups: TreeExpected[]
  }
}

type TreeCases = Expect<Equal<Tree, TreeExpected>>

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

type DeepTree = TypeOf<typeof deepTreeSchema>
type DeepTreeCases = Expect<
  Equal<
    DeepTree,
    {
      id: string
      meta: {
        nested: {
          snapshots: DeepTree[][][]
        }
      }
    }
  >
>

const uploadSchema = schema.object({
  attachment: schema.file(),
  body: schema.arrayBuffer(),
  cover: schema.blob(),
  metadata: schema.any(),
  raw: schema.unknown(),
})

type Upload = TypeOf<typeof uploadSchema>
type UploadExpected = {
  attachment: File
  body: ArrayBuffer
  cover: Blob
  metadata: any
  raw: unknown
}

type UploadCases = Expect<Equal<Upload, UploadExpected>>

const enumSchema = schema.enum({ Draft: 'draft', Published: 'published' } as const)
type EnumCases = Expect<Equal<TypeOf<typeof enumSchema>, 'draft' | 'published'>>

const optionalSchema = schema.object({
  name: schema.string().optional(),
})

type OptionalDoesNotBecomeUndefinedUnion = Expect<Equal<TypeOf<typeof optionalSchema>, { name?: string }>>

// @ts-expect-error optional key schema should not equal a required undefined union
type OptionalIsNotRequiredUndefined = Expect<Equal<TypeOf<typeof optionalSchema>, { name: string | undefined }>>

// @ts-expect-error array item must be a schema
const invalidArraySchema = schema.array(1)

export type Cases =
  | ProfileCases
  | RequestCases
  | MatrixCases
  | TreeCases
  | DeepTreeCases
  | UploadCases
  | EnumCases
  | OptionalDoesNotBecomeUndefinedUnion

export { invalidArraySchema }
