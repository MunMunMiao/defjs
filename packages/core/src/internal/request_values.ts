export type RequestBuildValue = readonly unknown[] | Record<string, unknown> | string | number | boolean | null | undefined

export type RequestFormDataScalar = boolean | null | number | string | undefined
export type RequestFormDataFileLike = Blob | File
export type RequestFormDataValue =
  | RequestFormDataScalar
  | RequestFormDataFileLike
  | readonly RequestFormDataScalar[]
  | readonly RequestFormDataFileLike[]

export interface RequestBodyOptions {
  readonly contentType?: string | null
}
