import { createTagNamespace, type Infer, struct, tag } from './index'

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

const DbTag = createTagNamespace('db')
const db = tag.defineConfig(DbTag)

const userStruct = struct.object({
  id: struct.number().tag(tag.json('id'), tag.uri('id'), db('column', 'id'), db('primaryKey')),
  name: struct.string().optional().tag(tag.json('user_name'), tag.urlencoded('user_name')),
})

// @ts-expect-error XML tag helper was removed from the struct surface.
tag.xml('name')

// @ts-expect-error XML tag kind was removed from the struct surface.
tag.kind.xml

// @ts-expect-error XmlTag was removed from public exports.
type MissingXmlTag = typeof import('./index').XmlTag

// @ts-expect-error XML object encoder was removed from public exports.
type MissingEncodeXmlObject = typeof import('./index').encodeXmlObject

// @ts-expect-error XML object decoder was removed from public exports.
type MissingDecodeXmlObject = typeof import('./index').decodeXmlObject

type UserOutputCase = Expect<
  Equal<
    Infer<typeof userStruct>,
    {
      id: number
      name?: string
    }
  >
>

export type Cases = UserOutputCase
