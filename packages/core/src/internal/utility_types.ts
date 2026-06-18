/**
 * Internal utility types that mirror TypeScript built-ins.
 *
 * The project intentionally avoids TypeScript's built-in utility types
 * (Partial, Pick, Record, etc.) in favor of explicit equivalents.
 */

export type SelectKeys<T, K extends keyof T> = { [P in K]: T[P] }

export type ExcludeUnion<T, U> = T extends U ? never : T

export type NonNullableValue<T> = T extends null | undefined ? never : T

export type FnReturn<T> = T extends (...args: infer _P) => infer R ? R : never
