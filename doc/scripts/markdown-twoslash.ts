import fs from 'node:fs'
import path from 'node:path'

export type TwoslashLanguage = 'ts' | 'tsx' | 'vue'

export interface TwoslashBlock {
  code: string
  filePath: string
  index: number
  info: string
  lang: TwoslashLanguage
  startLine: number
}

const IGNORED_DIRS = new Set(['.vitepress', 'node_modules'])

function normalizeLanguage(raw: string): TwoslashLanguage | undefined {
  switch (raw) {
    case 'ts':
    case 'typescript':
      return 'ts'
    case 'tsx':
      return 'tsx'
    case 'vue':
      return 'vue'
    default:
      return undefined
  }
}

export function extractTwoslashBlocks(markdown: string, filePath = 'inline.md'): TwoslashBlock[] {
  const blocks: TwoslashBlock[] = []
  const fencePattern = /(^|\n)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n\2[ \t]*(?=\n|$)/g

  let match: RegExpExecArray | null
  while ((match = fencePattern.exec(markdown)) !== null) {
    const prefix = match[1]
    const rawInfo = match[3]
    const code = match[4]
    const info = rawInfo.trim()
    const parts = info.split(/\s+/).filter(Boolean)
    const lang = normalizeLanguage(parts[0] ?? '')

    if (!lang || !parts.includes('twoslash')) {
      continue
    }

    const fenceStart = match.index + prefix.length
    const fenceLine = markdown.slice(0, fenceStart).split('\n').length

    blocks.push({
      code,
      filePath,
      index: blocks.length + 1,
      info,
      lang,
      startLine: fenceLine + 1,
    })
  }

  return blocks
}

export function listMarkdownFiles(rootDir: string): string[] {
  const files: string[] = []

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          walk(fullPath)
        }
        continue
      }

      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath)
      }
    }
  }

  walk(rootDir)
  return files.sort()
}

export function readTwoslashBlocks(rootDir: string): TwoslashBlock[] {
  return listMarkdownFiles(rootDir).flatMap((file) => {
    const markdown = fs.readFileSync(file, 'utf8')
    const relativePath = path.relative(rootDir, file).split(path.sep).join('/')
    return extractTwoslashBlocks(markdown, relativePath)
  })
}
