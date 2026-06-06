export type { ErrorMap } from './errors'
export { StructError, setErrorMap } from './errors'
export { struct } from './facade'
export { isStruct } from './guards'
export type { StructField } from './introspection'
export {
  getFieldTag,
  getFieldTags,
  getStructFields,
  isObjectStruct,
} from './introspection'
export type { FieldTag, FieldTagContext, FieldTagOption, MutableFieldTag, TagNamespace, TagScalar } from './tag'
export {
  createTagNamespace,
  HeaderTag,
  JsonTag,
  MultipartTag,
  QueryTag,
  tag,
  tagKind,
  UriTag,
  UrlencodedTag,
} from './tag'
export type {
  AnySchema as AnyStruct,
  ArraySchema,
  DiscriminatedUnionSchema,
  FlattenedSchemaError,
  FormattedSchemaError,
  Infer,
  NumberSchema,
  ObjectSchema,
  ObjectShape,
  RecordSchema,
  RequestBodyCodec,
  RequestBodySchema,
  RequestSchema,
  RequestShape,
  Schema as Struct,
  SchemaIssue,
  SchemaLike as StructLike,
  StringSchema,
  TupleSchema,
  UnionSchema,
} from './types'
