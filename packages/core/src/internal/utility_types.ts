/**
 * Minimal internal utility types.
 *
 * The project intentionally avoids TypeScript's built-in utility types
 * (Partial, Pick, Record, etc.) and also avoids rebuilding a parallel
 * utility-type library. Only two helpers remain:
 *
 * - `ExcludeUnion`: distributive union filtering used by the struct core types.
 * - `FnReturn`: return-type extraction used for recursive schema types and
 *   cross-runtime timer handles where writing the type by hand is error-prone.
 */

export type ExcludeUnion<T, U> = T extends U ? never : T

export type FnReturn<T> = T extends (...args: infer _P) => infer R ? R : never
