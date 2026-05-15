import { describe, expect, test } from 'vitest'
import { struct } from './index'

describe('shape.ts getter-recursive structures', () => {
  test('parses getter-recursive objects without an explicit recursive constructor', () => {
    type Category = {
      children: Category[]
      id: string
    }

    const category = struct.object({
      get children() {
        return struct.array(category)
      },
      id: struct.string(),
    })

    const [err, value] = category.parse({
      children: [{ children: [], id: 'child' }],
      id: 'root',
    })
    if (err) {
      throw err
    }

    expect(value).toEqual({
      children: [{ children: [], id: 'child' }],
      id: 'root',
    } satisfies Category)
  })

  test('reports getter-recursive errors with nested paths', () => {
    const comment = struct.object({
      id: struct.string(),
      get replies() {
        return struct.array(comment)
      },
    })

    const [err] = comment.parse({
      id: 'root',
      replies: [{ id: 1, replies: [] }],
    })

    expect(err?.issues[0]?.path).toEqual(['replies', 0, 'id'])
  })
})
