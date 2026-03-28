import { _any } from './any'
import { _array } from './array'
import { _arrayBuffer } from './arraybuffer'
import { _blob } from './blob'
import { _boolean } from './boolean'
import {
  type AnyCompatibleSchema,
  type CompatibleInputOf,
  type CompatibleOutputOf,
  isCompatibleSchema,
  isStandardSchemaLike,
  parseCompatibleSchema,
  type StandardSchemaLike,
} from './compatible'
import { _enum } from './enum'
import { _file } from './file'
import { _literal } from './literal'
import { _null } from './null'
import { _number } from './number'
import { _object } from './object'
import { _or } from './or'
import { _record } from './record'
import {
  type AnySchema,
  type FieldOutput,
  type InputOf,
  isSchema,
  type ObjectInput,
  type ObjectOutput,
  type ObjectShape,
  type Schema,
  SchemaError,
  type SchemaIssue,
  type TypeOf,
} from './schema'
import { _string } from './string'
import { _tuple } from './tuple'
import { _unknown } from './unknown'

export type {
  AnyCompatibleSchema,
  AnySchema,
  CompatibleInputOf,
  CompatibleOutputOf,
  FieldOutput,
  InputOf,
  ObjectInput,
  ObjectOutput,
  ObjectShape,
  Schema,
  SchemaIssue,
  StandardSchemaLike,
  TypeOf,
}
export { isCompatibleSchema, isSchema, isStandardSchemaLike, parseCompatibleSchema, SchemaError }

export const schema = {
  any: _any,
  array: _array,
  arrayBuffer: _arrayBuffer,
  blob: _blob,
  boolean: _boolean,
  enum: _enum,
  file: _file,
  literal: _literal,
  null: _null,
  number: _number,
  object: _object,
  or: _or,
  record: _record,
  string: _string,
  tuple: _tuple,
  unknown: _unknown,
} as const
