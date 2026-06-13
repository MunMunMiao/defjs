import { isStruct } from './guards'
import type { ObjectDefinition, ObjectShape, RuntimeSchema, SchemaLike } from './types'

export function resolveObjectShape(schema: RuntimeSchema, definition: ObjectDefinition): ObjectShape {
  const cached = definition.cache.get(schema)
  if (cached) {
    return cached
  }

  const shape = readObjectShape(definition.shape)

  for (const [key, value] of Object.entries(shape)) {
    assertSchema(value, `object field "${key}"`)
  }

  definition.cache.set(schema, shape)
  return shape
}

export function resolveRuntimeSchema(schema: RuntimeSchema): RuntimeSchema {
  return schema
}

export function readObjectShape(shape: ObjectShape): ObjectShape {
  const output: Record<string, unknown> = Object.create(null)
  const descriptors = Object.getOwnPropertyDescriptors(shape)

  for (const [key, descriptor] of Object.entries(descriptors)) {
    const value = typeof descriptor.get === 'function' ? descriptor.get.call(shape) : descriptor.value

    output[key] = value
  }

  return output as unknown as ObjectShape
}

export function assertSchema(value: unknown, label: string): asserts value is SchemaLike<unknown, unknown, boolean> {
  if (!isStruct(value)) {
    throw new TypeError(`${label} must be a schema`)
  }
}
