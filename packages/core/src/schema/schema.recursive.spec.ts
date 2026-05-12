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

    expect(tree.parse({ id: 'root' })).toEqual({
      children: [],
      id: 'root',
      meta: {
        snapshots: [],
      },
    })

    expect(
      tree.parse({
        children: [{ id: 'leaf' }],
        id: 'root',
        meta: {
          snapshots: [[[{ id: 'child' }]]],
        },
      }),
    ).toEqual({
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

    expect(
      root.parse({
        branch: {
          children: [{ name: 'branch-child' }],
          name: 'branch-root',
        },
        name: 'root',
      }),
    ).toEqual({
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

    expect(matrix.parse([[[{ name: 'A' }]]])).toEqual([[[{ name: 'A' }]]])
    expect(() => matrix.parse('bad')).toThrowError(SchemaError)
    expect(() => matrix.parse([[[{ name: 1 } as never]]])).toThrowError(SchemaError)
  })
})
