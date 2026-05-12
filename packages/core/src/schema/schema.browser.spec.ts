import { describe, expect, test } from 'vitest'
import { SchemaError, schema } from './index'

describe('schema in real browser environment', () => {
  test('blob / file / arrayBuffer validate native Web API instances', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' })
    const file = new File(['data'], 'doc.txt', { type: 'text/plain' })
    const buffer = new ArrayBuffer(8)

    const [be, bv] = schema.blob().parse(blob)
    expect(be).toBeNull()
    expect(bv).toBe(blob)

    const [fe, fv] = schema.file().parse(file)
    expect(fe).toBeNull()
    expect(fv).toBe(file)

    const [ae, av] = schema.arrayBuffer().parse(buffer)
    expect(ae).toBeNull()
    expect(av).toBe(buffer)

    const [badBlob] = schema.blob().parse('not a blob')
    expect(badBlob).toBeInstanceOf(SchemaError)

    const [badFile] = schema.file().parse(blob)
    expect(badFile).toBeInstanceOf(SchemaError)

    const [badAb] = schema.arrayBuffer().parse(file)
    expect(badAb).toBeInstanceOf(SchemaError)
  })

  test('blob and file zero values are constructible in browser', () => {
    const [, zeroBlob] = schema.blob().parse(undefined)
    const [, zeroFile] = schema.file().parse(undefined)
    const [, zeroBuffer] = schema.arrayBuffer().parse(undefined)

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

    const [err, parsed] = uploadSchema.parse(payload)
    expect(err).toBeNull()
    expect(parsed!.attachment.name).toBe('avatar.png')
    expect(parsed!.cover.type).toBe('image/jpeg')
    expect(parsed!.bytes.byteLength).toBe(16)

    const [asyncErr, asyncVal] = await uploadSchema.parseAsync(payload)
    expect(asyncErr).toBeNull()
    expect(asyncVal).toMatchObject({ caption: 'hello' })
  })

  test('date and bigint work in browser runtime', () => {
    const d = new Date('2026-05-12T08:00:00Z')
    const [de, dv] = schema.date().parse(d)
    expect(de).toBeNull()
    expect(dv).toBe(d)

    const [be, bv] = schema.bigint().parse(2026n)
    expect(be).toBeNull()
    expect(bv).toBe(2026n)
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
