import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTwoslasher, type TwoslashInstance } from 'twoslash'
import { createTwoslasher as createVueTwoslasher } from 'twoslash-vue'
import ts from 'typescript'

import type { TwoslashBlock } from './markdown-twoslash'

export interface TwoslashDiagnostic {
  blockIndex: number
  character: number
  code: string
  filePath: string
  level: 'error'
  line: number
  text: string
}

interface RawTwoslashError {
  character?: number
  code?: number | string
  id?: number | string
  level?: string
  line?: number
  text?: string
}

export interface TwoslashChecker {
  checkBlock(block: TwoslashBlock): TwoslashDiagnostic[]
  clearCache(): void
}

const DOC_DIR = path.resolve(fileURLToPath(new URL('..', import.meta.url)), '..')

export const DOC_COMPILER_OPTIONS: ts.CompilerOptions = {
  allowImportingTsExtensions: true,
  baseUrl: DOC_DIR,
  jsx: ts.JsxEmit.Preserve,
  lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  paths: {
    '@defjs/core': ['packages/core/src/index.ts'],
    '@defjs/opentelemetry-server': ['packages/opentelemetry-server/src/index.ts'],
    '@defjs/react': ['packages/react/src/index.ts'],
    '@defjs/vue': ['packages/vue/src/index.ts'],
  },
  skipLibCheck: true,
  strict: true,
  target: ts.ScriptTarget.ES2022,
  types: ['node'],
}

const HANDBOOK_OPTIONS = {
  noErrorValidation: true,
}

function errorCode(error: RawTwoslashError): string {
  const raw = error.code ?? error.id ?? 'unknown'
  return typeof raw === 'number' ? `TS${raw}` : String(raw)
}

function errorCodeNumber(error: RawTwoslashError): number | undefined {
  const raw = error.code ?? error.id
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) ? value : undefined
}

function isUnexpectedError(error: RawTwoslashError, expectedCodes: Set<number>): boolean {
  if (error.level && error.level !== 'error') {
    return false
  }

  const code = errorCodeNumber(error)
  return code === undefined || !expectedCodes.has(code)
}

function toDiagnostic(block: TwoslashBlock, error: RawTwoslashError): TwoslashDiagnostic {
  return {
    blockIndex: block.index,
    character: error.character ?? 1,
    code: errorCode(error),
    filePath: block.filePath,
    level: 'error',
    line: block.startLine + Math.max((error.line ?? 1) - 1, 0),
    text: error.text ?? 'Unknown Twoslash error.',
  }
}

export function createTwoslashChecker(): TwoslashChecker {
  const tsRunner: TwoslashInstance = createTwoslasher({
    compilerOptions: DOC_COMPILER_OPTIONS,
    handbookOptions: HANDBOOK_OPTIONS,
  })
  const vueRunner: TwoslashInstance = createVueTwoslasher({
    compilerOptions: DOC_COMPILER_OPTIONS,
    handbookOptions: HANDBOOK_OPTIONS,
  })

  return {
    checkBlock(block) {
      const runner = block.lang === 'vue' ? vueRunner : tsRunner
      const result = runner(block.code, block.lang, {
        compilerOptions: DOC_COMPILER_OPTIONS,
        handbookOptions: HANDBOOK_OPTIONS,
      })
      const expectedCodes = new Set((result.meta.handbookOptions.errors ?? []).map(Number))

      return (result.errors as RawTwoslashError[])
        .filter((error) => isUnexpectedError(error, expectedCodes))
        .map((error) => toDiagnostic(block, error))
    },
    clearCache() {
      tsRunner.getCacheMap()?.clear()
      vueRunner.getCacheMap()?.clear()
    },
  }
}
