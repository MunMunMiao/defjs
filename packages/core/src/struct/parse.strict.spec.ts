import { describe, expect, test } from 'vitest'
import { StructError, struct } from './index'

describe('parse.ts unknownFields option', () => {
  const user = struct.object({
    id: struct.string(),
    nickname: struct.string().optional(),
  })

  test('default parse strips unknown fields and keeps missing fields as zero values', () => {
    const [okErr, okVal] = user.parse({ id: 'u_1', extra: 'ignored' })
    if (okErr) {
      throw okErr
    }
    expect(okVal).toEqual({ id: 'u_1' })

    const [zeroErr, zeroVal] = user.parse({})
    if (zeroErr) {
      throw zeroErr
    }
    expect(zeroVal).toEqual({ id: '' })
  })

  test('unknownFields: error rejects unknown keys', () => {
    const [okErr, okVal] = user.parse({ id: 'u_1' }, { unknownFields: 'error' })
    if (okErr) {
      throw okErr
    }
    expect(okVal).toEqual({ id: 'u_1' })

    const [unkErr] = user.parse({ id: 'u_1', extra: 'no' }, { unknownFields: 'error' })
    expect(unkErr).toBeInstanceOf(StructError)
    expect(unkErr?.message).toContain('Unrecognized key')
  })
})
