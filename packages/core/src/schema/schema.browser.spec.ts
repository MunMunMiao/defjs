import { describe, expect, test } from 'vitest'
import { SchemaError, schema } from './index'

describe('schema in real browser environment', () => {
  test('blob / file / arrayBuffer validate native Web API instances', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' })
    const file = new File(['data'], 'doc.txt', { type: 'text/plain' })
    const buffer = new ArrayBuffer(8)

    expect(schema.blob().parse(blob)).toBe(blob)
    expect(schema.file().parse(file)).toBe(file)
    expect(schema.arrayBuffer().parse(buffer)).toBe(buffer)

    expect(() => schema.blob().parse('not a blob')).toThrowError(SchemaError)
    expect(() => schema.file().parse(blob)).toThrowError(SchemaError)
    expect(() => schema.arrayBuffer().parse(file)).toThrowError(SchemaError)
  })

  test('blob and file zero values are constructible in browser', () => {
    const zeroBlob = schema.blob().parse(undefined)
    const zeroFile = schema.file().parse(undefined)
    const zeroBuffer = schema.arrayBuffer().parse(undefined)

    expect(zeroBlob).toBeInstanceOf(Blob)
    expect(zeroFile).toBeInstanceOf(File)
    expect(zeroBuffer).toBeInstanceOf(ArrayBuffer)
    expect((zeroBuffer as ArrayBuffer).byteLength).toBe(0)
  })

  test('upload object schema integrates web types end-to-end', async () => {
    const uploadSchema = schema.object({
      attachment: schema.file(),
      cover: schema.blob(),
      bytes: schema.arrayBuffer(),
      caption: schema.string().min(1),
    })

    const payload = {
      attachment: new File(['image'], 'avatar.png', { type: 'image/png' }),
      cover: new Blob(['cover'], { type: 'image/jpeg' }),
      bytes: new ArrayBuffer(16),
      caption: 'hello',
    }

    const parsed = uploadSchema.parse(payload)
    expect(parsed.attachment.name).toBe('avatar.png')
    expect(parsed.cover.type).toBe('image/jpeg')
    expect(parsed.bytes.byteLength).toBe(16)

    await expect(uploadSchema.parseAsync(payload)).resolves.toMatchObject({
      caption: 'hello',
    })
  })

  test('date and bigint work in browser runtime', () => {
    const d = new Date('2026-05-12T08:00:00Z')
    expect(schema.date().parse(d)).toBe(d)

    expect(schema.bigint().parse(2026n)).toBe(2026n)
  })

  test('Standard Schema bridge accepts payloads with Web API instances', () => {
    const userSchema = schema.object({
      avatar: schema.file(),
      name: schema.string(),
    })

    const standard = userSchema['~standard']
    const result = standard.validate({
      avatar: new File([''], 'cover.png'),
      name: 'x',
    })

    if (!('value' in result)) {
      throw new Error('expected success')
    }
    expect((result.value as { name: string }).name).toBe('x')
  })
})
