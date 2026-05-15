import { describe, expect, test } from 'vitest'
import { StructError, struct } from './index'

describe('constructors.ts browser primitives', () => {
  test('blob / file / arrayBuffer validate native Web API instances', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' })
    const file = new File(['data'], 'doc.txt', { type: 'text/plain' })
    const buffer = new ArrayBuffer(8)

    const [be, bv] = struct.blob().parse(blob)
    if (be) {
      throw be
    }
    expect(bv).toBe(blob)

    const [fe, fv] = struct.file().parse(file)
    if (fe) {
      throw fe
    }
    expect(fv).toBe(file)

    const [ae, av] = struct.arrayBuffer().parse(buffer)
    if (ae) {
      throw ae
    }
    expect(av).toBe(buffer)

    const [badBlob] = struct.blob().parse('not a blob')
    expect(badBlob).toBeInstanceOf(StructError)

    const [badFile] = struct.file().parse(blob)
    expect(badFile).toBeInstanceOf(StructError)

    const [badAb] = struct.arrayBuffer().parse(file)
    expect(badAb).toBeInstanceOf(StructError)
  })

  test('blob and file zero values are constructible in browser', () => {
    const [blobErr, zeroBlob] = struct.blob().parse(undefined)
    if (blobErr) {
      throw blobErr
    }
    const [fileErr, zeroFile] = struct.file().parse(undefined)
    if (fileErr) {
      throw fileErr
    }
    const [bufferErr, zeroBuffer] = struct.arrayBuffer().parse(undefined)
    if (bufferErr) {
      throw bufferErr
    }

    expect(zeroBlob).toBeInstanceOf(Blob)
    expect(zeroFile).toBeInstanceOf(File)
    expect(zeroBuffer).toBeInstanceOf(ArrayBuffer)
    expect((zeroBuffer as ArrayBuffer).byteLength).toBe(0)
  })

  test('upload object schema integrates web types end-to-end', async () => {
    const uploadSchema = struct.object({
      attachment: struct.file(),
      cover: struct.blob(),
      bytes: struct.arrayBuffer(),
      caption: struct.string(),
    })

    const payload = {
      attachment: new File(['image'], 'avatar.png', { type: 'image/png' }),
      cover: new Blob(['cover'], { type: 'image/jpeg' }),
      bytes: new ArrayBuffer(16),
      caption: 'hello',
    }

    const [err, parsed] = uploadSchema.parse(payload)
    if (err) {
      throw err
    }
    expect(parsed.attachment.name).toBe('avatar.png')
    expect(parsed.cover.type).toBe('image/jpeg')
    expect(parsed.bytes.byteLength).toBe(16)

    const [asyncErr, asyncVal] = await uploadSchema.parseAsync(payload)
    if (asyncErr) {
      throw asyncErr
    }
    expect(asyncVal).toMatchObject({ caption: 'hello' })
  })

  test('date and bigint work in browser runtime', () => {
    const d = new Date('2026-05-12T08:00:00Z')
    const [de, dv] = struct.date().parse(d)
    if (de) {
      throw de
    }
    expect(dv).toBe(d)

    const [be, bv] = struct.bigint().parse(2026n)
    if (be) {
      throw be
    }
    expect(bv).toBe(2026n)
  })

  test('Standard Schema bridge accepts payloads with Web API instances', () => {
    const userSchema = struct.object({
      avatar: struct.file(),
      name: struct.string(),
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
