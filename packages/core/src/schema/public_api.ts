export type { AnyCompatibleSchema, CompatibleInputOf, CompatibleOutputOf, StandardSchemaLike } from './compatible'
export { isCompatibleSchema, isStandardSchemaLike, parseCompatibleSchema } from './compatible'
export { schema } from './facade'
export type {
  AnySchema,
  ArraySchema,
  DiscriminatedUnionSchema,
  ErrorMap,
  FieldOutput,
  FlattenedSchemaError,
  FormattedSchemaError,
  InputOf,
  NumberSchema,
  ObjectInput,
  ObjectOutput,
  ObjectSchema,
  ObjectShape,
  RecordSchema,
  SafeParseResult,
  Schema,
  SchemaIssue,
  SchemaLike,
  SchemaMethods,
  StandardSchemaIssueLike,
  StandardSchemaProps,
  StandardSchemaResultFailure,
  StandardSchemaResultSuccess,
  StrictOptions,
  StringSchema,
  TupleSchema,
  TypeOf,
  UnionSchema,
} from './schema'
export { isSchema, SchemaError, setErrorMap } from './schema'
