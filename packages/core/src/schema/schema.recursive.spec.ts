import { describe, expect, test } from 'vitest'
import { SchemaError, schema } from './index'
import type { ObjectSchema, SchemaLike } from './schema'

type Recursive = ObjectSchema<Record<string, SchemaLike<any, any, boolean>>>

describe('schema recursive structures', () => {
  test('supports recursive trees and deep references to root self', () => {
    const tree: Recursive = schema.object({
      id: schema.string(),
      get children() {
        return schema.array(tree)
      },
      meta: schema.object({
        get snapshots() {
          return schema.array(schema.array(schema.array(tree)))
        },
      }),
    }) as Recursive

    const [e1, v1] = tree.parse({ id: 'root' })
    expect(e1).toBeNull()
    expect(v1).toEqual({
      children: [],
      id: 'root',
      meta: {
        snapshots: [],
      },
    })

    const [e2, v2] = tree.parse({
      children: [{ id: 'leaf' }],
      id: 'root',
      meta: {
        snapshots: [[[{ id: 'child' }]]],
      },
    })
    expect(e2).toBeNull()
    expect(v2).toEqual({
      children: [
        {
          children: [],
          id: 'leaf',
          meta: {
            snapshots: [],
          },
        },
      ],
      id: 'root',
      meta: {
        snapshots: [
          [
            [
              {
                children: [],
                id: 'child',
                meta: {
                  snapshots: [],
                },
              },
            ],
          ],
        ],
      },
    })
  })

  test('supports nested self for branch recursion', () => {
    const root: Recursive = schema.object({
      name: schema.string(),
      get branch() {
        const branch: Recursive = schema.object({
          name: schema.string(),
          get children() {
            return schema.array(branch)
          },
          get roots() {
            return schema.array(root)
          },
        }) as Recursive

        return branch
      },
    }) as Recursive

    const [err, val] = root.parse({
      branch: {
        children: [{ name: 'branch-child' }],
        name: 'branch-root',
      },
      name: 'root',
    })
    expect(err).toBeNull()
    expect(val).toEqual({
      branch: {
        children: [
          {
            children: [],
            name: 'branch-child',
            roots: [],
          },
        ],
        name: 'branch-root',
        roots: [],
      },
      name: 'root',
    })
  })

  test('supports multi-dimensional arrays of object payloads', () => {
    const matrix = schema.array(
      schema.array(
        schema.array(
          schema.object({
            name: schema.string(),
          }),
        ),
      ),
    )

    const [err, val] = matrix.parse([[[{ name: 'A' }]]])
    expect(err).toBeNull()
    expect(val).toEqual([[[{ name: 'A' }]]])
    const [e1] = matrix.parse('bad')
    expect(e1).toBeInstanceOf(SchemaError)
    const [e2] = matrix.parse([[[{ name: 1 } as never]]])
    expect(e2).toBeInstanceOf(SchemaError)
  })
})
