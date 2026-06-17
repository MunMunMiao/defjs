import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { formatDiagnostic, formatSummary, runTypecheck } from './typecheck-docs'

let tempDirs: string[] = []

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'defjs-docs-typecheck-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { force: true, recursive: true })
  }
  tempDirs = []
})

describe('formatDiagnostic', () => {
  it('formats file, block, location, code, and text', () => {
    expect(
      formatDiagnostic({
        blockIndex: 2,
        character: 8,
        code: 'TS2322',
        filePath: 'guide/start.md',
        level: 'error',
        line: 12,
        text: "Type 'string' is not assignable to type 'number'.",
      }),
    ).toBe("guide/start.md block #2 line 12:8\n  TS2322: Type 'string' is not assignable to type 'number'.")
  })
})

describe('formatSummary', () => {
  it('formats a success summary', () => {
    expect(
      formatSummary({
        blocksChecked: 1,
        diagnostics: [],
        filesChecked: 1,
      }),
    ).toBe('Checked 1 twoslash code block in 1 markdown file.\nNo Twoslash type errors found.')
  })

  it('formats a failure summary', () => {
    expect(
      formatSummary({
        blocksChecked: 2,
        diagnostics: [
          {
            blockIndex: 1,
            character: 1,
            code: 'TS2322',
            filePath: 'guide/start.md',
            level: 'error',
            line: 3,
            text: 'Bad assignment.',
          },
        ],
        filesChecked: 1,
      }),
    ).toBe('Checked 2 twoslash code blocks in 1 markdown file.\nFound 1 Twoslash type error.')
  })
})

describe('runTypecheck', () => {
  it('checks markdown twoslash blocks under the provided root', () => {
    const root = createTempDir()
    fs.writeFileSync(path.join(root, 'index.md'), ['```typescript twoslash', 'const value = 1', '```'].join('\n'))

    const result = runTypecheck(root)

    expect(result.filesChecked).toBe(1)
    expect(result.blocksChecked).toBe(1)
    expect(result.diagnostics).toEqual([])
  })
})
