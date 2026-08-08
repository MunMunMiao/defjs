// Describe only the parser surface used by this example.
declare module 'http-link-header' {
  export interface LinkReference {
    rel?: string
    uri: string
  }

  interface Link {
    rel(relation: string): LinkReference[]
  }

  const LinkHeader: {
    parse(value: string): Link
  }

  export default LinkHeader
}
