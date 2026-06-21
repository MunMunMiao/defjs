import { describe, expect, test } from 'vitest'
import { StructError, struct } from './index'
import { parseStructTuple as parse } from './introspection'

describe('constructors.ts browser primitives', () => {
  test('blob / file / arrayBuffer validate native Web API instances', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' })
    const file = new File(['data'], 'doc.txt', { type: 'text/plain' })
    const buffer = new ArrayBuffer(8)

    const [be, bv] = parse(struct.blob(), blob)
    if (be) {
      throw be
    }
    expect(bv).toBe(blob)

    const [fe, fv] = parse(struct.file(), file)
    if (fe) {
      throw fe
    }
    expect(fv).toBe(file)

    const [ae, av] = parse(struct.arrayBuffer(), buffer)
    if (ae) {
      throw ae
    }
    expect(av).toBe(buffer)

    const [badBlob] = parse(struct.blob(), 'not a blob')
    expect(badBlob).toBeInstanceOf(StructError)

    const [badFile] = parse(struct.file(), blob)
    expect(badFile).toBeInstanceOf(StructError)

    const [badAb] = parse(struct.arrayBuffer(), file)
    expect(badAb).toBeInstanceOf(StructError)
  })

  test('blob and file zero values are constructible in browser', () => {
    const [blobErr, zeroBlob] = parse(struct.blob(), undefined)
    if (blobErr) {
      throw blobErr
    }
    const [fileErr, zeroFile] = parse(struct.file(), undefined)
    if (fileErr) {
      throw fileErr
    }
    const [bufferErr, zeroBuffer] = parse(struct.arrayBuffer(), undefined)
    if (bufferErr) {
      throw bufferErr
    }

    expect(zeroBlob).toBeInstanceOf(Blob)
    expect(zeroFile).toBeInstanceOf(File)
    expect(zeroBuffer).toBeInstanceOf(ArrayBuffer)
    expect((zeroBuffer as ArrayBuffer).byteLength).toBe(0)
  })

  test('upload object struct integrates web types end-to-end', async () => {
    const uploadStruct = struct.object({
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

    const [err, parsed] = parse(uploadStruct, payload)
    if (err) {
      throw err
    }
    expect(parsed.attachment.name).toBe('avatar.png')
    expect(parsed.cover.type).toBe('image/jpeg')
    expect(parsed.bytes.byteLength).toBe(16)

    const [tupleErr, tupleVal] = parse(uploadStruct, payload)
    if (tupleErr) {
      throw tupleErr
    }
    expect(tupleVal).toMatchObject({ caption: 'hello' })
  })

  test('date and bigint work in browser runtime', () => {
    const d = new Date('2026-05-12T08:00:00Z')
    const [de, dv] = parse(struct.date(), d)
    if (de) {
      throw de
    }
    expect(dv).toBe(d)

    const [be, bv] = parse(struct.bigint(), 2026n)
    if (be) {
      throw be
    }
    expect(bv).toBe(2026n)
  })

  test('object struct accepts payloads with Web API instances', () => {
    const userStruct = struct.object({
      avatar: struct.file(),
      name: struct.string(),
    })

    const [error, value] = parse(userStruct, {
      avatar: new File([''], 'cover.png'),
      name: 'x',
    })
    if (error) {
      throw error
    }
    expect(value.name).toBe('x')
  })
})
