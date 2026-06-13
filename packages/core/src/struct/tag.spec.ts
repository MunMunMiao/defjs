import { describe, expect, test } from 'vitest'
import type { FieldTagOption } from './index'
import { createTagNamespace, getFieldTag, getFieldTags, struct, tag } from './index'

describe('tag.ts metadata', () => {
  test('should materialize built-in value tags with field-key fallback', () => {
    const field = struct.string().tag(tag.json(), tag.urlencoded('user_name'))

    const tags = getFieldTags(field, 'name')

    expect(tags.get(tag.kind.json)?.value).toBe('name')
    expect(tags.get(tag.kind.urlencoded)?.value).toBe('user_name')
    expect(typeof tag.kind.json).toBe('symbol')
  })

  test('should support custom config tags and let the last key win', () => {
    const DbTag = createTagNamespace('db')
    const db = tag.defineConfig(DbTag)

    const field = struct.number().tag(db('column', 'id'), db('column', 'user_id'), db('primaryKey'), db('primaryKey', false))
    const fieldTag = getFieldTag(field, DbTag.kind, 'id')

    expect(fieldTag?.config.get('column')).toBe('user_id')
    expect(fieldTag?.config.get('primaryKey')).toBe(false)
  })

  test('should keep tag chaining immutable', () => {
    const base = struct.string()
    const tagged = base.tag(tag.json('display_name'))

    expect(getFieldTags(base, 'name').size).toBe(0)
    expect(getFieldTag(tagged, tag.kind.json, 'name')?.value).toBe('display_name')
  })

  test('should require explicit names for request-location tags', () => {
    const implicitQueryTag = (tag.query as unknown as () => FieldTagOption)()
    const field = struct.string().tag(implicitQueryTag)

    expect(() => getFieldTags(field, 'name')).toThrow('tag.query() requires an explicit field name')
  })
})
