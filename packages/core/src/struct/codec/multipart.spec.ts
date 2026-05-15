import { describe, expect, test } from 'vitest'
import { encodeMultipart, struct, tag } from '../index'

describe('codec/multipart.ts', () => {
  test('encodes multipart/form-data body as FormData and keeps file values', () => {
    const upload = struct.object({
      avatar: struct.blob().tag(tag.multipart('avatar')),
      ignored: struct.string(),
      name: struct.string().tag(tag.multipart()),
    })
    const avatar = new Blob(['avatar'], { type: 'image/png' })

    const form = encodeMultipart(upload, {
      avatar,
      ignored: 'hidden',
      name: 'Miao',
    })

    expect(form).toBeInstanceOf(FormData)
    expect(form.get('avatar')).toBeInstanceOf(Blob)
    expect((form.get('avatar') as Blob).size).toBe(avatar.size)
    expect(form.get('ignored')).toBeNull()
    expect(form.get('name')).toBe('Miao')
  })
})
