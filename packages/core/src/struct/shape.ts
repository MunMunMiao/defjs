import { isStruct } from './guards'
import { DEFINITION } from './symbols'
import type { ObjectDefinition, ObjectShape, RuntimeStruct, StructLike } from './types'

export function resolveObjectShape(_struct: RuntimeStruct, definition: ObjectDefinition): ObjectShape {
  const cached = definition.cache.resolvedShape
  if (cached) {
    return cached
  }

  const shape = readObjectShape(definition.shape)
  for (const [key, value] of Object.entries(shape)) {
    assertStruct(value, `object field "${key}"`)
  }

  assertUniqueShapeWireKeys(shape)
  definition.cache.resolvedShape = shape
  return shape
}

export function readObjectShape(shape: ObjectShape): ObjectShape {
  const output: { [key: string]: unknown } = Object.create(null)
  const descriptors = Object.getOwnPropertyDescriptors(shape)

  for (const [key, descriptor] of Object.entries(descriptors)) {
    const value = typeof descriptor.get === 'function' ? descriptor.get.call(shape) : descriptor.value

    output[key] = value
  }

  return output as unknown as ObjectShape
}

function assertUniqueShapeWireKeys(shape: ObjectShape): void {
  const seen = new Map<string, string>()
  for (const [key, field] of Object.entries(shape)) {
    const runtime = field as unknown as RuntimeStruct
    const alias = runtime[DEFINITION].alias
    const wireKey = alias ?? key
    if (seen.has(wireKey)) {
      const previous = seen.get(wireKey) as string
      throw new TypeError(`duplicate wire key "${wireKey}" for object fields "${previous}" and "${key}"`)
    }
    seen.set(wireKey, key)
  }
}

export function assertStruct(value: unknown, label: string): asserts value is StructLike<unknown, unknown, boolean> {
  if (!isStruct(value)) {
    throw new TypeError(`${label} must be a struct`)
  }
}
