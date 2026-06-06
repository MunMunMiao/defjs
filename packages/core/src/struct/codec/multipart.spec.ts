import { describe, expect, test } from 'vitest'
import { struct, tag } from '../index'
import { encodeMultipart } from './multipart'

describe('codec/multipart.ts', () => {
  test('encodes multipart/form-data body as FormData and keeps file values', () => {
    const upload = struct.object({
      avatar: struct.blob().tag(tag.multipart('avatar')),
      fallbackName: struct.string(),
      name: struct.string().tag(tag.multipart()),
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
})
