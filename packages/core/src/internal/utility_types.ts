/**
 * Internal utility types that mirror TypeScript built-ins.
 *
 * The project intentionally avoids TypeScript's built-in utility types
 * (Partial, Pick, Record, etc.) in favor of explicit equivalents.
 */

export type Optional<T> = { [K in keyof T]?: T[K] }

export type RequireAll<T> = { [K in keyof T]-?: T[K] }

export type SelectKeys<T, K extends keyof T> = { [P in K]: T[P] }

export type OmitKeys<T, K extends keyof T> = {
  [P in keyof T as P extends K ? never : P]: T[P]
}

export type ExcludeUnion<T, U> = T extends U ? never : T

export type ExtractUnion<T, U> = T extends U ? T : never

export type NonNullableValue<T> = T extends null | undefined ? never : T

export type FnParams<T> = T extends (...args: infer P) => infer _R ? P : never

export type FnReturn<T> = T extends (...args: infer _P) => infer R ? R : never

export type AwaitedValue<T> = T extends null | undefined
  ? T
  : T extends object & { then(onfulfilled: infer F): unknown }
    ? F extends (value: infer V, ...args: unknown[]) => unknown
      ? AwaitedValue<V>
      : never
    : T
