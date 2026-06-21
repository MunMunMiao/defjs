import { describe, expect, test } from 'vitest'
import { struct } from '../index'
import { encodeMultipart } from './multipart'

describe('codec/multipart.ts', () => {
  test('encodes multipart/form-data body as FormData and keeps file values', () => {
    const upload = struct.object({
      avatar: struct.blob().alias('avatar'),
      fallbackName: struct.string(),
      name: struct.string().alias('name'),
    })
    const avatar = new Blob(['avatar'], { type: 'image/png' })

    const form = encodeMultipart(upload, {
      avatar,
      fallbackName: 'field-key',
      name: 'Miao',
    })

    expect(form).toBeInstanceOf(FormData)
    expect(form.get('avatar')).toBeInstanceOf(Blob)
    expect((form.get('avatar') as Blob).size).toBe(avatar.size)
    expect(form.get('fallbackName')).toBe('field-key')
    expect(form.get('name')).toBe('Miao')
  })

  test('skips missing optional date and bigint fields before primitive encode', () => {
    const body = struct.object({
      createdAt: struct.date().optional().alias('created_at'),
      count: struct.bigint().optional(),
      name: struct.string(),
    })

    const form = encodeMultipart(body, { count: undefined, name: 'miao' })

    expect(Array.from(form.entries())).toEqual([['name', 'miao']])
  })

  test('keeps multipart repeated array handling recursive', () => {
    const Body = struct.object({ value: struct.unknown() })

    const form = encodeMultipart(Body, { value: [['x'], undefined, ['y']] })

    expect(Array.from(form.entries())).toEqual([
      ['value', 'x'],
      ['value', 'y'],
    ])
  })
})
