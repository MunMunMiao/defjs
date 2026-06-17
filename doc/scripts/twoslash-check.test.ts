import { afterAll, describe, expect, it } from 'vitest'

import type { TwoslashBlock } from './markdown-twoslash'
import { createTwoslashChecker } from './twoslash-check'

const checker = createTwoslashChecker()

function block(code: string): TwoslashBlock {
  return {
    code,
    filePath: 'inline.md',
    index: 1,
    info: 'typescript twoslash',
    lang: 'ts',
    startLine: 1,
  }
}

afterAll(() => {
  checker.clearCache()
})

describe('createTwoslashChecker', () => {
  it('passes a valid defjs request example', () => {
    const diagnostics = checker.checkBlock(
      block(`
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user/:id',
  input: struct.object({
    id: struct.number(),
  }),
  output: {
    '200': struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
  },
})

async function loadUser() {
  const [error, user] = await client.execute(getUser({ id: 1 }))
  if (error) {
    return error.code
  }
  return user.name
}
`),
    )

    expect(diagnostics).toEqual([])
  })

  it('reports an invalid defjs request example', () => {
    const diagnostics = checker.checkBlock(
      block(`
import { defineRequest } from '@defjs/core'

defineRequest({ method: 'GET' })
`),
    )

    expect(diagnostics.length).toBeGreaterThan(0)
    expect(diagnostics[0].filePath).toBe('inline.md')
    expect(diagnostics[0].blockIndex).toBe(1)
  })

  it('does not report errors declared with @errors', () => {
    const diagnostics = checker.checkBlock(
      block(`
// @errors: 2322
const value: number = 'text'
`),
    )

    expect(diagnostics).toEqual([])
  })
})
