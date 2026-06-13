import type { Infer } from './index'

// @ts-expect-error XmlTag was removed from public exports.
import type { XmlTag } from './index'

// @ts-expect-error XML object encoder was removed from public exports.
import type { encodeXmlObject } from './index'

// @ts-expect-error XML object decoder was removed from public exports.
import type { decodeXmlObject } from './index'
import { createTagNamespace, struct, tag } from './index'

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
const missingXmlKind = tag.kind.xml
void missingXmlKind

export type MissingXmlTag = XmlTag
export type MissingEncodeXmlObject = typeof encodeXmlObject
export type MissingDecodeXmlObject = typeof decodeXmlObject

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
