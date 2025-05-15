import { type BaseMetadata, type Schema, _metadata, createSchema, isSchema } from './schema'
import type { Infer } from './util'

export type TupleOutput<Shapes extends Schema[], Rest extends Schema | undefined> = [
  ...{
    [K in keyof Shapes]: Shapes[K] extends Schema ? Infer<Shapes[K]> : never
  },
  ...(Rest extends Schema ? Infer<Rest>[] : []),
]

export interface TupleMetadata<Shapes extends Schema[], Rest extends Schema | undefined> extends BaseMetadata<TupleOutput<Shapes, Rest>> {
  kind: 'tuple'
  shape?: Shapes
  restShape?: Rest
}

export interface TupleSchema<Shapes extends Schema[], Rest extends Schema | undefined = undefined> extends Schema {
  readonly [_metadata]: TupleMetadata<Shapes, Rest>
}

export function _tuple<const Shapes extends Schema[]>(shapes: Shapes): TupleSchema<Shapes>
export function _tuple<const Shapes extends Schema[], const Rest extends Schema>(shapes: Shapes, shape: Rest): TupleSchema<Shapes, Rest>
export function _tuple<const Shapes extends Schema[], const Rest extends Schema>(
  shapes: Shapes,
  shape?: Rest,
): TupleSchema<Shapes, Rest> | TupleSchema<Shapes> {
  let _shapes: Shapes
  let _restShape: Rest | undefined

  if (Array.isArray(shapes)) {
    _shapes = shapes
  } else {
    throw new Error('schema must be an array')
  }

  for (const shape of _shapes) {
    if (!isSchema(shape)) {
      throw new Error('schema must be a Schema')
    }
  }

  if (shape) {
    if (!isSchema(shape)) {
      throw new Error('schema must be a Schema')
    }
    _restShape = shape
  }

  const md = {
    kind: 'tuple',
    shapes: shapes,
    restShape: _restShape,
  } as unknown as TupleMetadata<Shapes, Rest>

  return createSchema(md) as TupleSchema<Shapes, Rest>
}
