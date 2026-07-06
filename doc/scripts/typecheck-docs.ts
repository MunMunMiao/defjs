import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { readTwoslashBlocks } from './markdown-twoslash'
import { createTwoslashChecker, type TwoslashDiagnostic } from './twoslash-check'

export interface TypecheckResult {
  blocksChecked: number
  diagnostics: TwoslashDiagnostic[]
  filesChecked: number
}

const DOC_DIR = path.resolve(fileURLToPath(new URL('..', import.meta.url)), '..')

export function formatDiagnostic(diagnostic: TwoslashDiagnostic): string {
  return `${diagnostic.filePath} block #${diagnostic.blockIndex} line ${diagnostic.line}:${diagnostic.character}\n  ${diagnostic.code}: ${diagnostic.text}`
}

export function formatSummary(result: TypecheckResult): string {
  const blockWord = result.blocksChecked === 1 ? 'code block' : 'code blocks'
  const fileWord = result.filesChecked === 1 ? 'markdown file' : 'markdown files'
  const lines = [`Checked ${result.blocksChecked} twoslash ${blockWord} in ${result.filesChecked} ${fileWord}.`]

  if (result.diagnostics.length === 0) {
    lines.push('No Twoslash type errors found.')
  } else {
    const errorWord = result.diagnostics.length === 1 ? 'error' : 'errors'
    lines.push(`Found ${result.diagnostics.length} Twoslash type ${errorWord}.`)
  }

  return lines.join('\n')
}

export function runTypecheck(rootDir = DOC_DIR): TypecheckResult {
  const blocks = readTwoslashBlocks(rootDir)
  const checker = createTwoslashChecker()

  try {
    const diagnostics = blocks.flatMap((block) => checker.checkBlock(block))
    const filesChecked = new Set(blocks.map((block) => block.filePath)).size

    return {
      blocksChecked: blocks.length,
      diagnostics,
      filesChecked,
    }
  } finally {
    checker.clearCache()
  }
}

export function printResult(result: TypecheckResult): void {
  for (const diagnostic of result.diagnostics) {
    console.error(formatDiagnostic(diagnostic))
  }

  if (result.diagnostics.length > 0) {
    console.error('')
  }

  const summary = formatSummary(result)
  if (result.diagnostics.length > 0) {
    console.error(summary)
  } else {
    console.log(summary)
  }
}

export function main(): void {
  const result = runTypecheck()
  printResult(result)

  if (result.diagnostics.length > 0) {
    process.exitCode = 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
