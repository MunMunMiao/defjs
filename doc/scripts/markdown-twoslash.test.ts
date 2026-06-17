import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { extractTwoslashBlocks, listMarkdownFiles, readTwoslashBlocks } from './markdown-twoslash'

let tempDirs: string[] = []

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'defjs-docs-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { force: true, recursive: true })
  }
  tempDirs = []
})

describe('extractTwoslashBlocks', () => {
  it('extracts TypeScript twoslash fences', () => {
    const markdown = ['# Demo', '', '```typescript twoslash', 'const value = 1', '```'].join('\n')

    expect(extractTwoslashBlocks(markdown, 'demo.md')).toEqual([
      {
        code: 'const value = 1',
        filePath: 'demo.md',
        index: 1,
        info: 'typescript twoslash',
        lang: 'ts',
        startLine: 4,
      },
    ])
  })

  it('extracts tsx and vue twoslash fences', () => {
    const markdown = [
      '```tsx twoslash',
      'const element = <div />',
      '```',
      '',
      '```vue twoslash',
      '<script setup lang="ts">',
      'const value = 1',
      '</script>',
      '```',
    ].join('\n')

    const blocks = extractTwoslashBlocks(markdown, 'component.md')

    expect(blocks.map((block) => block.lang)).toEqual(['tsx', 'vue'])
    expect(blocks.map((block) => block.index)).toEqual([1, 2])
  })

  it('ignores plain TypeScript fences and non-TypeScript fences', () => {
    const markdown = ['```typescript', 'const value = 1', '```', '', '```json twoslash', '{ "value": 1 }', '```'].join('\n')

    expect(extractTwoslashBlocks(markdown, 'plain.md')).toEqual([])
  })

  it('supports tilde fences', () => {
    const markdown = ['~~~ts twoslash', 'const value = 1', '~~~'].join('\n')

    expect(extractTwoslashBlocks(markdown, 'tilde.md')).toHaveLength(1)
  })
})

describe('listMarkdownFiles', () => {
  it('lists markdown files and skips ignored directories', () => {
    const root = createTempDir()
    fs.mkdirSync(path.join(root, 'guide'), { recursive: true })
    fs.mkdirSync(path.join(root, '.vitepress', 'cache'), { recursive: true })
    fs.mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true })
    fs.writeFileSync(path.join(root, 'index.md'), '# Home')
    fs.writeFileSync(path.join(root, 'guide', 'start.md'), '# Start')
    fs.writeFileSync(path.join(root, '.vitepress', 'cache', 'ignored.md'), '# Cache')
    fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'ignored.md'), '# Dependency')

    const files = listMarkdownFiles(root).map((file) => path.relative(root, file).split(path.sep).join('/'))

    expect(files).toEqual(['guide/start.md', 'index.md'])
  })
})

describe('readTwoslashBlocks', () => {
  it('reads twoslash blocks from markdown files with normalized paths', () => {
    const root = createTempDir()
    fs.mkdirSync(path.join(root, 'guide'), { recursive: true })
    fs.writeFileSync(path.join(root, 'guide', 'start.md'), ['```typescript twoslash', 'const value = 1', '```'].join('\n'))

    expect(readTwoslashBlocks(root)).toEqual([
      {
        code: 'const value = 1',
        filePath: 'guide/start.md',
        index: 1,
        info: 'typescript twoslash',
        lang: 'ts',
        startLine: 2,
      },
    ])
  })
})
